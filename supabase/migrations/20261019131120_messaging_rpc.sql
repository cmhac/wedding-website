-- Messaging functions.
--
--   resolve_audience          staff or service role: who a campaign reaches
--   claim_campaign_messages   service role only: take queued messages to send
--   record_message_event      service role only: apply a provider notification
--   due_scheduled_campaigns   service role only: campaigns whose time has come
--   set_reminders_opt_out     guest: change their own household's opt-out
--
-- Error codes (SQLSTATE P0001, message is the code): forbidden, not_a_guest,
-- invalid_payload, not_found.

-- ---------------------------------------------------------------------------
-- resolve_audience(filter, message_type_key) -> one row per matching household
--
-- `deliverable` is false (with a `skip_reason`) when the household has no
-- contact email (`no_email`) or, for a non-essential message type, has opted
-- out of reminders (`opted_out`). Households with no email are returned so
-- they can be listed for paper invitations. When `message_type_key` is omitted
-- the opt-out is not applied here (the claim step applies it with the real
-- type), so pass the type to preview the true recipients.
-- ---------------------------------------------------------------------------
create function public.resolve_audience(filter jsonb, message_type_key text default null)
returns table (household_id uuid, display_name text, deliverable boolean, skip_reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_audience jsonb := resolve_audience.filter;
  v_type text := resolve_audience.message_type_key;
  v_scope text;
  v_filters jsonb;
  v_apply_opt_out boolean := false;
  v_essential boolean;
begin
  perform private.require_staff_or_service();

  if not public.is_valid_audience(v_audience) then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  if v_type is not null then
    select t.is_essential into v_essential from public.message_types t where t.key = v_type;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    v_apply_opt_out := not v_essential;
  end if;

  v_scope := v_audience ->> 'scope';
  v_filters := coalesce(v_audience -> 'filters', '{}'::jsonb);

  return query
  select
    h.id,
    h.display_name,
    h.contact_email is not null and not (v_apply_opt_out and h.reminders_opt_out),
    case
      when h.contact_email is null then 'no_email'
      when v_apply_opt_out and h.reminders_opt_out then 'opted_out'
    end
  from public.households h
  where (
    v_scope = 'all'
    or (v_scope = 'household' and h.id = (v_audience ->> 'household_id')::uuid)
    or (
      v_scope = 'filter'
      and (not (v_filters ? 'invited_to_event') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id
        join public.events e on e.id = i.event_id
        where g.household_id = h.id and e.slug = v_filters ->> 'invited_to_event'
      ))
      -- Optional events never count as "has not responded".
      and (not (v_filters ? 'required_events_unanswered') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id and i.status = 'pending'
        join public.events e on e.id = i.event_id and e.is_required
        where g.household_id = h.id
      ))
      and (not (v_filters ? 'optional_event_unanswered') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id and i.status = 'pending'
        join public.events e on e.id = i.event_id and not e.is_required
        where g.household_id = h.id and e.slug = v_filters ->> 'optional_event_unanswered'
      ))
      -- Same rule as household_rsvp_progress.pending_meals: an attending guest
      -- with no choice for a course that needs one, on a published menu, where
      -- the course has a dish that can be chosen.
      and (not (v_filters ? 'meals_not_chosen') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id and i.status = 'attending'
        join public.menus mn on mn.event_id = i.event_id and mn.status = 'published'
        join public.courses c on c.menu_id = mn.id and c.requires_choice
        where g.household_id = h.id
          and exists (select 1 from public.dishes d where d.course_id = c.id and d.archived_at is null)
          and not exists (
            select 1 from public.meal_selections ms where ms.guest_id = g.id and ms.course_id = c.id
          )
      ))
      -- Received means sent or delivered, in any campaign of that type.
      and (not (v_filters ? 'not_yet_sent_message_type') or not exists (
        select 1 from public.messages m
        join public.campaigns c on c.id = m.campaign_id
        where m.household_id = h.id
          and c.message_type_key = v_filters ->> 'not_yet_sent_message_type'
          and m.status in ('sent', 'delivered')
      ))
      and (not (v_filters ? 'delivery_problem') or h.delivery_problem)
    )
  )
  order by h.display_name, h.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_campaign_messages(campaign_id, limit)
--
-- Moves up to `limit` queued messages of a sending campaign to `sending` and
-- returns them, writing each household's current contact email into
-- `to_email`. Rows are locked with `for update skip locked`, so concurrent
-- claims never return the same message. A queued message that can no longer be
-- sent is marked `skipped` instead and not returned: the household was deleted
-- (`household_missing`), its email was cleared (`no_email`), or it opted out
-- and the message type is not essential (`opted_out`). A batch that only skips
-- keeps going, so an empty result means nothing is left to send.
-- ---------------------------------------------------------------------------
create function public.claim_campaign_messages(campaign_id uuid, "limit" integer)
returns table (id uuid, household_id uuid, to_email extensions.citext)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_campaign uuid := claim_campaign_messages.campaign_id;
  v_limit integer := greatest(coalesce(claim_campaign_messages."limit", 0), 0);
  v_essential boolean;
  v_picked integer;
  v_claimed integer;
  r record;
begin
  select t.is_essential into v_essential
    from public.campaigns c
    join public.message_types t on t.key = c.message_type_key
    where c.id = v_campaign and c.status = 'sending';
  if v_essential is null or v_limit = 0 then
    return;
  end if;

  loop
    v_picked := 0;
    v_claimed := 0;
    for r in
      with picked as (
        select m.id, m.household_id
          from public.messages m
          where m.campaign_id = v_campaign and m.status = 'queued'
          order by m.queued_at, m.id
          limit v_limit
          for update skip locked
      ),
      resolved as (
        select p.id,
               h.contact_email,
               case
                 when h.id is null then 'household_missing'
                 when h.contact_email is null then 'no_email'
                 when not v_essential and h.reminders_opt_out then 'opted_out'
               end as skip
          from picked p
          left join public.households h on h.id = p.household_id
      ),
      changed as (
        update public.messages m
           set status = case when rs.skip is null then 'sending' else 'skipped' end::public.message_status,
               skip_reason = rs.skip,
               to_email = case when rs.skip is null then rs.contact_email end
          from resolved rs
          where m.id = rs.id
          returning m.id, m.household_id, m.to_email, m.status
      )
      select * from changed
    loop
      v_picked := v_picked + 1;
      if r.status = 'sending' then
        v_claimed := v_claimed + 1;
        id := r.id;
        household_id := r.household_id;
        to_email := r.to_email;
        return next;
      end if;
    end loop;
    exit when v_picked = 0 or v_claimed > 0;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_message_event(provider_event_id, provider_message_id, type, occurred_at)
--
-- Applies a provider notification to a message. `type` is the provider's event
-- name (`email.sent`, `email.delivered`, `email.bounced`, `email.complained`,
-- `email.failed`; the part after `email.` alone also works). Returns:
--   applied          the message status changed
--   ignored          known message, but the event moves nothing (or the type is
--                    not one we track, in which case nothing is stored)
--   duplicate        this provider event id was already recorded
--   unknown_message  no message has this provider message id (for example a
--                    sign-in email); nothing is stored
--
-- Ranking: queued 0 < sending 1 < sent 2 < delivered 3. bounced, complained and
-- failed are terminal and win over ranks 0 to 3, but the first terminal status
-- stays. Skipped messages never change. A bounce or complaint also sets the
-- household's delivery_problem flag, unless the household's address has changed
-- since the message was sent.
-- ---------------------------------------------------------------------------
create function public.record_message_event(
  provider_event_id text, provider_message_id text, type text, occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event text := record_message_event.provider_event_id;
  v_provider text := record_message_event.provider_message_id;
  v_type text := record_message_event.type;
  v_at timestamptz := coalesce(record_message_event.occurred_at, now());
  v_new public.message_status;
  v_msg public.messages;
  v_old_rank integer;
  v_new_rank integer;
  v_apply boolean;
begin
  if nullif(btrim(v_event), '') is null or nullif(btrim(v_provider), '') is null or v_type is null then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  v_new := case regexp_replace(v_type, '^email\.', '')
    when 'sent' then 'sent'
    when 'delivered' then 'delivered'
    when 'bounced' then 'bounced'
    when 'complained' then 'complained'
    when 'failed' then 'failed'
  end::public.message_status;
  if v_new is null then
    return 'ignored';
  end if;

  select * into v_msg from public.messages m where m.provider_message_id = v_provider for update;
  if not found then
    return 'unknown_message';
  end if;

  insert into public.message_events (provider_event_id, message_id, type, occurred_at)
    values (v_event, v_msg.id, v_type, v_at)
    on conflict (provider_event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  v_old_rank := case v_msg.status when 'queued' then 0 when 'sending' then 1 when 'sent' then 2 when 'delivered' then 3 end;
  v_new_rank := case v_new when 'sent' then 2 when 'delivered' then 3 end;
  v_apply := case
    when v_msg.status = 'skipped' then false
    when v_msg.status in ('bounced', 'complained', 'failed') then false
    when v_new in ('bounced', 'complained', 'failed') then true
    else v_new_rank > v_old_rank
  end;

  update public.messages m
     set status = case when v_apply then v_new else m.status end,
         sent_at = case when v_apply and v_new = 'sent' then coalesce(m.sent_at, v_at) else m.sent_at end,
         last_event_at = greatest(coalesce(m.last_event_at, v_at), v_at)
   where m.id = v_msg.id;

  if v_new in ('bounced', 'complained') and v_msg.household_id is not null then
    update public.households h
       set delivery_problem = true
     where h.id = v_msg.household_id
       and h.contact_email is not distinct from v_msg.to_email;
  end if;

  return case when v_apply then 'applied' else 'ignored' end;
end;
$$;

-- Campaigns that are scheduled and due, earliest first.
create function public.due_scheduled_campaigns()
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from public.campaigns c
    where c.status = 'scheduled' and c.scheduled_for <= now()
    order by c.scheduled_for, c.id;
$$;

-- ---------------------------------------------------------------------------
-- set_reminders_opt_out(opt_out) -> the new value
--
-- A guest changes only their own household. Not signed in, or no household:
-- not_a_guest.
-- ---------------------------------------------------------------------------
create function public.set_reminders_opt_out(opt_out boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hid uuid := private.my_household_id();
begin
  if opt_out is null then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  update public.households set reminders_opt_out = opt_out where id = v_hid;
  return opt_out;
end;
$$;

-- Permissions. Everything starts closed; open only what each caller needs.
revoke execute on function
  public.resolve_audience(jsonb, text),
  public.claim_campaign_messages(uuid, integer),
  public.record_message_event(text, text, text, timestamptz),
  public.due_scheduled_campaigns(),
  public.set_reminders_opt_out(boolean)
from public, anon, authenticated;

grant execute on function public.resolve_audience(jsonb, text) to authenticated, service_role;
grant execute on function
  public.claim_campaign_messages(uuid, integer),
  public.record_message_event(text, text, text, timestamptz),
  public.due_scheduled_campaigns()
to service_role;
grant execute on function public.set_reminders_opt_out(boolean) to anon, authenticated, service_role;
