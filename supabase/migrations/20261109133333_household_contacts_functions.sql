-- Household contacts: the functions that read or wrote households.contact_email
-- now use household_contacts, then the column is dropped.
--
--   import_one_household    reads `contacts` (a list of addresses) instead of `contact_email`,
--                           and an optional `id` so the caller can name the household's
--                           synthetic sign-in address before it exists
--   create_household_record reports a staff address as staff_account
--   add / update / remove_household_contact replace set_household_contact
--   resolve_audience, claim_campaign_messages, record_message_event
--                           read contacts (one message per household until the
--                           per-address messaging change)
--
-- Error codes (SQLSTATE P0001, message is the code): forbidden, invalid_payload,
-- not_found, email_in_use, staff_account.

-- The column an imported address came from: contact_email, contact_email_2, ...
create function private.contact_field(i integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when i <= 1 then 'contact_email' else 'contact_email_' || i end;
$$;

create or replace function private.import_one_household(h jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  errors jsonb := '[]'::jsonb;
  guests_in jsonb;
  g jsonb;
  v_slug jsonb;
  hrow integer;
  grow integer;
  v_name text;
  v_contacts jsonb;
  v_addr text;
  v_seen text[] := '{}';
  v_idx integer := 0;
  v_celem jsonb;
  v_paper boolean;
  v_allowance integer := 0;
  v_deadline timestamptz;
  v_address jsonb;
  v_first text;
  v_last text;
  v_gemail text;
  v_placeholder boolean;
  v_plus_one boolean;
  v_seats integer := 0;
  seen_names text[] := '{}';
  name_key text;
  v_hid uuid;
  v_gid uuid;
  v_guest_ids uuid[] := '{}';
  v_invites integer := 0;
  v_added integer;
  email_pattern constant text := '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
begin
  if jsonb_typeof(h) is distinct from 'object' then
    return jsonb_build_object('errors', jsonb_build_array(
      private.import_error(null, 'household', 'each household must be an object', 'invalid_payload')));
  end if;

  guests_in := case when jsonb_typeof(h -> 'guests') = 'array' then h -> 'guests' else '[]'::jsonb end;
  hrow := coalesce(private.json_row_number(h), private.json_row_number(guests_in -> 0));

  v_name := nullif(btrim(h ->> 'display_name'), '');
  if v_name is null then
    errors := errors || private.import_error(hrow, 'display_name', 'is required');
  end if;

  -- Addresses arrive as a list of strings. Errors name the column the address
  -- came from: contact_email for the first, contact_email_2 for the second, ...
  v_contacts := case when jsonb_typeof(h -> 'contacts') = 'array' then h -> 'contacts' else '[]'::jsonb end;
  v_paper := coalesce((h ->> 'paper_only')::boolean, false);
  for v_celem in select * from jsonb_array_elements(v_contacts) loop
    v_idx := v_idx + 1;
    v_addr := case when jsonb_typeof(v_celem) = 'string' then nullif(btrim(v_celem #>> '{}'), '') end;
    continue when v_addr is null;
    if v_paper then
      errors := errors || private.import_error(hrow, private.contact_field(v_idx), 'a paper-only household has no contact email');
    elsif v_addr !~ email_pattern then
      errors := errors || private.import_error(hrow, private.contact_field(v_idx), 'is not a valid email address');
    elsif lower(v_addr) = any (v_seen) then
      errors := errors || private.import_error(hrow, private.contact_field(v_idx), 'is listed more than once for this household');
    elsif exists (
      select 1 from public.household_contacts c where c.kind = 'email' and c.value = v_addr::extensions.citext
    ) then
      errors := errors || private.import_error(hrow, private.contact_field(v_idx), 'is already used by another household', 'email_in_use');
    elsif exists (
      select 1 from public.staff s join auth.users u on u.id = s.user_id where lower(u.email) = lower(v_addr)
    ) then
      errors := errors || private.import_error(hrow, private.contact_field(v_idx), 'cannot be used for a household', 'staff_account');
    end if;
    v_seen := v_seen || lower(v_addr);
  end loop;

  if h ? 'plus_one_allowance' and jsonb_typeof(h -> 'plus_one_allowance') <> 'null' then
    if jsonb_typeof(h -> 'plus_one_allowance') = 'number'
       and (h ->> 'plus_one_allowance') ~ '^[0-9]{1,4}$' then
      v_allowance := (h ->> 'plus_one_allowance')::integer;
    else
      errors := errors || private.import_error(hrow, 'plus_one_allowance', 'must be a whole number, zero or more');
    end if;
  end if;

  if h ? 'rsvp_deadline_override' and jsonb_typeof(h -> 'rsvp_deadline_override') = 'string' then
    if pg_input_is_valid(h ->> 'rsvp_deadline_override', 'timestamptz') then
      v_deadline := (h ->> 'rsvp_deadline_override')::timestamptz;
    else
      errors := errors || private.import_error(hrow, 'rsvp_deadline_override', 'is not a valid date and time');
    end if;
  end if;

  v_address := case when jsonb_typeof(h -> 'address') = 'object' then h -> 'address' end;

  if jsonb_array_length(guests_in) = 0 then
    errors := errors || private.import_error(hrow, 'guests', 'a household needs at least one guest');
  end if;

  for g in select * from jsonb_array_elements(guests_in) loop
    grow := coalesce(private.json_row_number(g), hrow);
    v_placeholder := coalesce((g ->> 'is_placeholder')::boolean, false);
    v_plus_one := v_placeholder or coalesce((g ->> 'is_plus_one')::boolean, false);
    v_first := nullif(btrim(g ->> 'first_name'), '');
    v_last := nullif(btrim(g ->> 'last_name'), '');
    v_gemail := nullif(btrim(g ->> 'email'), '');

    if v_plus_one then
      v_seats := v_seats + 1;
    end if;

    if not v_placeholder then
      if v_first is null then
        errors := errors || private.import_error(grow, 'first_name', 'is required');
      end if;
      if v_last is null then
        errors := errors || private.import_error(grow, 'last_name', 'is required');
      end if;
      if v_first is not null and v_last is not null then
        name_key := lower(v_first) || '|' || lower(v_last);
        if name_key = any (seen_names) then
          errors := errors || private.import_error(grow, 'first_name', 'duplicates another guest in the same household');
        end if;
        seen_names := seen_names || name_key;
      end if;
    end if;

    if v_gemail is not null and v_gemail !~ email_pattern then
      errors := errors || private.import_error(grow, 'email', 'is not a valid email address');
    end if;

    if g ? 'events' and jsonb_typeof(g -> 'events') <> 'null' then
      if jsonb_typeof(g -> 'events') <> 'array' then
        errors := errors || private.import_error(grow, 'events', 'must be a list of event slugs');
      else
        for v_slug in select * from jsonb_array_elements(g -> 'events') loop
          if jsonb_typeof(v_slug) <> 'string'
             or not exists (select 1 from public.events e where e.slug = v_slug #>> '{}') then
            errors := errors || private.import_error(grow, 'events', 'names an event that does not exist');
          end if;
        end loop;
      end if;
    end if;
  end loop;

  if v_seats > v_allowance then
    errors := errors || private.import_error(hrow, 'plus_one_allowance', 'is lower than the number of plus-one guests');
  end if;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('errors', errors);
  end if;

  -- Everything checked: create the household, its guests and invitations
  -- together. The block is a subtransaction, so a failure leaves nothing behind.
  begin
    insert into public.households (
      id, display_name, auth_user_id, address, plus_one_allowance,
      rsvp_deadline_override, notes
    ) values (
      coalesce(nullif(h ->> 'id', '')::uuid, gen_random_uuid()), v_name, (h ->> 'auth_user_id')::uuid, v_address, v_allowance,
      v_deadline, nullif(btrim(h ->> 'notes'), '')
    ) returning id into v_hid;

    insert into public.household_contacts (household_id, kind, value)
    select v_hid, 'email', a
      from (select distinct on (lower(a)) a
              from (select btrim(e #>> '{}') as a
                      from jsonb_array_elements(v_contacts) e
                     where jsonb_typeof(e) = 'string') raw
             where a <> ''
             order by lower(a), a) addrs;

    for g in select * from jsonb_array_elements(guests_in) loop
      v_placeholder := coalesce((g ->> 'is_placeholder')::boolean, false);
      v_plus_one := v_placeholder or coalesce((g ->> 'is_plus_one')::boolean, false);
      insert into public.guests (
        household_id, first_name, last_name, email, is_placeholder, is_plus_one,
        dietary_notes, notes
      ) values (
        v_hid,
        case when v_placeholder then null else nullif(btrim(g ->> 'first_name'), '') end,
        case when v_placeholder then null else nullif(btrim(g ->> 'last_name'), '') end,
        nullif(btrim(g ->> 'email'), '')::extensions.citext,
        v_placeholder, v_plus_one,
        nullif(btrim(g ->> 'dietary_notes'), ''), nullif(btrim(g ->> 'notes'), '')
      ) returning id into v_gid;
      v_guest_ids := v_guest_ids || v_gid;

      if jsonb_typeof(g -> 'events') = 'array' then
        insert into public.invitations (guest_id, event_id, invited_by)
        select v_gid, e.id, auth.uid()
          from public.events e
         where e.slug in (select jsonb_array_elements_text(g -> 'events'))
        on conflict do nothing;
        get diagnostics v_added = row_count;
        v_invites := v_invites + v_added;
      end if;
    end loop;
  exception
    when unique_violation then
      return jsonb_build_object('errors', jsonb_build_array(
        private.import_error(hrow, 'contact_email', 'is already used by another household', 'email_in_use')));
    when invalid_text_representation then
      return jsonb_build_object('errors', jsonb_build_array(
        private.import_error(hrow, 'household', 'contains a value of the wrong type', 'invalid_payload')));
  end;

  return jsonb_build_object(
    'household_id', v_hid,
    'guest_ids', to_jsonb(v_guest_ids),
    'invitations', v_invites,
    'errors', '[]'::jsonb
  );
end;
$$;

create or replace function public.create_household_record(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform private.require_staff();

  r := private.import_one_household(payload);

  if exists (select 1 from jsonb_array_elements(r -> 'errors') e where e ->> 'code' = 'email_in_use') then
    raise exception 'email_in_use' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(r -> 'errors') e where e ->> 'code' = 'staff_account') then
    raise exception 'staff_account' using errcode = 'P0001';
  end if;
  if jsonb_array_length(r -> 'errors') > 0 then
    raise exception 'invalid_payload' using errcode = 'P0001',
      detail = (select jsonb_agg(e - 'code') from jsonb_array_elements(r -> 'errors') e)::text;
  end if;

  return jsonb_build_object(
    'household_id', r -> 'household_id',
    'guest_ids', r -> 'guest_ids',
    'invitations', r -> 'invitations'
  );
end;
$$;

-- Staff address management. A household's Auth user never changes with its
-- addresses (its sign-in address is synthetic), so these touch only
-- household_contacts.
drop function public.set_household_contact(uuid, text, uuid);

-- add_household_contact(household_id, value) -> the new contact's id
create function public.add_household_contact(household_id uuid, value text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text := nullif(btrim(value), '');
  v_id uuid;
begin
  perform private.require_staff();

  if v_value is null or v_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.households h where h.id = add_household_contact.household_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  begin
    insert into public.household_contacts (household_id, kind, value)
      values (add_household_contact.household_id, 'email', v_value)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'email_in_use' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

-- update_household_contact(household_id, contact_id, value): a new address
-- clears the delivery problem flag (a trigger does this).
create function public.update_household_contact(household_id uuid, contact_id uuid, value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text := nullif(btrim(value), '');
begin
  perform private.require_staff();

  if v_value is null or v_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  begin
    update public.household_contacts c
       set value = v_value
     where c.id = update_household_contact.contact_id
       and c.household_id = update_household_contact.household_id;
  exception when unique_violation then
    raise exception 'email_in_use' using errcode = 'P0001';
  end;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- remove_household_contact(household_id, contact_id) -> {paper_only}: true when
-- that was the household's last address.
create function public.remove_household_contact(household_id uuid, contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();

  delete from public.household_contacts c
   where c.id = remove_household_contact.contact_id
     and c.household_id = remove_household_contact.household_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'paper_only',
    not exists (
      select 1 from public.household_contacts c
       where c.household_id = remove_household_contact.household_id
    )
  );
end;
$$;

revoke execute on function
  public.add_household_contact(uuid, text),
  public.update_household_contact(uuid, uuid, text),
  public.remove_household_contact(uuid, uuid)
from public, anon;
grant execute on function
  public.add_household_contact(uuid, text),
  public.update_household_contact(uuid, uuid, text),
  public.remove_household_contact(uuid, uuid)
to authenticated, service_role;

create or replace function public.resolve_audience(filter jsonb, message_type_key text default null)
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
    exists (select 1 from public.household_contacts c where c.household_id = h.id and c.kind = 'email') and not (v_apply_opt_out and h.reminders_opt_out),
    case
      when not exists (select 1 from public.household_contacts c where c.household_id = h.id and c.kind = 'email') then 'no_email'
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

create or replace function public.claim_campaign_messages(campaign_id uuid, "limit" integer)
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
          where m.campaign_id = v_campaign
            and (
              m.status = 'queued'
              or (
                m.status = 'sending'
                and m.provider_message_id is null
                and coalesce(m.claimed_at, m.queued_at) < now() - interval '15 minutes'
              )
            )
          order by m.queued_at, m.id
          limit v_limit
          for update skip locked
      ),
      resolved as (
        select p.id,
               fc.value as contact_email,
               case
                 when h.id is null then 'household_missing'
                 when fc.value is null then 'no_email'
                 when not v_essential and h.reminders_opt_out then 'opted_out'
               end as skip
          from picked p
          left join public.households h on h.id = p.household_id
          left join lateral (
            select c.value from public.household_contacts c
             where c.household_id = h.id and c.kind = 'email'
             order by c.created_at, c.id limit 1
          ) fc on true
      ),
      changed as (
        update public.messages m
           set status = case when rs.skip is null then 'sending' else 'skipped' end::public.message_status,
               skip_reason = rs.skip,
               to_email = case when rs.skip is null then rs.contact_email end,
               claimed_at = case when rs.skip is null then now() end
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

create or replace function public.record_message_event(
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
    update public.household_contacts c
       set delivery_problem = true
     where c.household_id = v_msg.household_id
       and c.kind = 'email'
       and c.value is not distinct from v_msg.to_email;
  end if;

  return case when v_apply then 'applied' else 'ignored' end;
end;
$$;

-- Nothing reads the column any more.
alter table public.households drop column contact_email;
