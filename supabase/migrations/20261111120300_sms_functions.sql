-- Text message functions (data-model.md: New and changed database functions).
-- All security definer with an empty search_path. The phone-writing functions
-- and the by-number consent function are callable by the service role only:
-- server routes validate the number as a United States number first.

-- The caller's own household contacts, now with ids and, for phones, the
-- opt-in state. The guest API masks the values and hides phones while texting
-- is not available.
create or replace function public.get_my_contacts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hid uuid := private.my_household_id();
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'kind', c.kind,
        'value', c.value::text,
        'consent', case when c.kind = 'phone' then c.sms_consent::text end
      )
      order by c.created_at, c.id
    )
    from public.household_contacts c
    where c.household_id = v_hid
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_my_contacts() from public, anon;
grant execute on function public.get_my_contacts() to anon, authenticated;

-- record_sms_consent(answers): the consent step. A guest answers for numbers of
-- their own household that have not been asked yet. Returns the ids that
-- became opted in, so the server can send one confirmation text each. A repeat
-- or an id that is not theirs changes nothing.
create function public.record_sms_consent(answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hid uuid := private.my_household_id();
  a jsonb;
  v_id uuid;
  v_opt boolean;
  v_new jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(answers) is distinct from 'array'
     or jsonb_array_length(answers) = 0
     or jsonb_array_length(answers) > 10 then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  for a in select * from jsonb_array_elements(answers) loop
    if jsonb_typeof(a -> 'opt_in') is distinct from 'boolean'
       or jsonb_typeof(a -> 'contact_id') is distinct from 'string' then
      raise exception 'invalid_payload' using errcode = 'P0001';
    end if;
    begin
      v_id := (a ->> 'contact_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_payload' using errcode = 'P0001';
    end;
    v_opt := (a ->> 'opt_in')::boolean;

    update public.household_contacts c
       set sms_consent = case when v_opt then 'opted_in' else 'declined' end::public.sms_consent_state,
           sms_consent_at = now(),
           sms_consent_source = 'first_sign_in'
     where c.id = v_id
       and c.household_id = v_hid
       and c.kind = 'phone'
       and c.sms_consent = 'not_asked';
    if found and v_opt then
      v_new := v_new || to_jsonb(v_id);
    end if;
  end loop;

  return v_new;
end;
$$;

revoke execute on function public.record_sms_consent(jsonb) from public, anon;
grant execute on function public.record_sms_consent(jsonb) to authenticated;

-- find_phone_contact(value): the household and contact for an E.164 number, or
-- null. Service role only; the sign-in route calls it after the limiter.
create function public.find_phone_contact(value text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('household_id', c.household_id, 'contact_id', c.id)
    from public.household_contacts c
   where c.kind = 'phone' and c.value = find_phone_contact.value::extensions.citext
   limit 1;
$$;

-- record_sms_consent_for_number(household_id, value): the sign-in prompt's
-- ticked box for a known number. Sets opted_in from not_asked or declined and
-- says whether that is new (so a confirmation is sent only once).
create function public.record_sms_consent_for_number(household_id uuid, value text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_state public.sms_consent_state;
begin
  select c.id, c.sms_consent into v_id, v_state
    from public.household_contacts c
   where c.household_id = record_sms_consent_for_number.household_id
     and c.kind = 'phone'
     and c.value = record_sms_consent_for_number.value::extensions.citext;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if v_state = 'opted_in' then
    return jsonb_build_object('found', true, 'contact_id', v_id, 'newly_opted_in', false);
  end if;

  update public.household_contacts c
     set sms_consent = 'opted_in',
         sms_consent_at = now(),
         sms_consent_source = 'sign_in_prompt'
   where c.id = v_id;
  return jsonb_build_object('found', true, 'contact_id', v_id, 'newly_opted_in', true);
end;
$$;

-- Staff phone management, called by server routes after validating the number.
create function public.add_phone_contact(household_id uuid, value text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if value is null or value !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.households h where h.id = add_phone_contact.household_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  begin
    insert into public.household_contacts (household_id, kind, value)
      values (add_phone_contact.household_id, 'phone', add_phone_contact.value)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'phone_in_use' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

create function public.update_phone_contact(household_id uuid, contact_id uuid, value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if value is null or value !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  begin
    update public.household_contacts c
       set value = update_phone_contact.value
     where c.id = update_phone_contact.contact_id
       and c.household_id = update_phone_contact.household_id
       and c.kind = 'phone';
  exception when unique_violation then
    raise exception 'phone_in_use' using errcode = 'P0001';
  end;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.remove_phone_contact(household_id uuid, contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.household_contacts c
   where c.id = remove_phone_contact.contact_id
     and c.household_id = remove_phone_contact.household_id
     and c.kind = 'phone';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'paper_only',
    not exists (
      select 1 from public.household_contacts c
       where c.household_id = remove_phone_contact.household_id
    )
  );
end;
$$;

revoke execute on function
  public.find_phone_contact(text),
  public.record_sms_consent_for_number(uuid, text),
  public.add_phone_contact(uuid, text),
  public.update_phone_contact(uuid, uuid, text),
  public.remove_phone_contact(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.find_phone_contact(text),
  public.record_sms_consent_for_number(uuid, text),
  public.add_phone_contact(uuid, text),
  public.update_phone_contact(uuid, uuid, text),
  public.remove_phone_contact(uuid, uuid)
to service_role;

-- claim_campaign_messages becomes channel-aware. For a text row the contact and
-- its opt-in are re-read at claim time: a removed number is skipped no_phone,
-- one that is no longer opted in is skipped not_opted_in. A text claimed but
-- never confirmed (no provider id) and 15 minutes old is NOT re-queued: with no
-- way to make a retry safe, it is marked failed unknown_outcome for staff to
-- check. Emails keep today's automatic retry.
drop function public.claim_campaign_messages(uuid, integer);

create function public.claim_campaign_messages(campaign_id uuid, "limit" integer)
returns table (
  id uuid,
  household_id uuid,
  channel public.message_channel,
  to_email extensions.citext,
  to_phone text
)
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

  update public.messages m
     set status = 'failed', error_code = 'unknown_outcome'
   where m.campaign_id = v_campaign
     and m.channel = 'text'
     and m.status = 'sending'
     and m.provider_message_id is null
     and coalesce(m.claimed_at, m.queued_at) < now() - interval '15 minutes';

  loop
    v_picked := 0;
    v_claimed := 0;
    for r in
      with picked as (
        select m.id, m.household_id, m.contact_id, m.channel
          from public.messages m
          where m.campaign_id = v_campaign
            and (
              m.status = 'queued'
              or (
                m.channel = 'email'
                and m.status = 'sending'
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
               p.channel,
               c.value as contact_value,
               case
                 when h.id is null then 'household_missing'
                 when c.id is null then case when p.channel = 'text' then 'no_phone' else 'no_email' end
                 when p.channel = 'text' and c.sms_consent <> 'opted_in' then 'not_opted_in'
                 when not v_essential and h.reminders_opt_out then 'opted_out'
               end as skip
          from picked p
          left join public.households h on h.id = p.household_id
          left join public.household_contacts c on c.id = p.contact_id
      ),
      changed as (
        update public.messages m
           set status = case when rs.skip is null then 'sending' else 'skipped' end::public.message_status,
               skip_reason = rs.skip,
               to_email = case when rs.skip is null and rs.channel = 'email' then rs.contact_value end,
               to_phone = case when rs.skip is null and rs.channel = 'text' then rs.contact_value::text end,
               claimed_at = case when rs.skip is null then now() end
          from resolved rs
          where m.id = rs.id
          returning m.id, m.household_id, m.channel, m.to_email, m.to_phone, m.status
      )
      select * from changed
    loop
      v_picked := v_picked + 1;
      if r.status = 'sending' then
        v_claimed := v_claimed + 1;
        id := r.id;
        household_id := r.household_id;
        channel := r.channel;
        to_email := r.to_email;
        to_phone := r.to_phone;
        return next;
      end if;
    end loop;
    exit when v_picked = 0 or v_claimed > 0;
  end loop;
end;
$$;

revoke execute on function public.claim_campaign_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_campaign_messages(uuid, integer) to service_role;

-- record_text_status: a Twilio delivery notification, already mapped to our
-- statuses by the server. Same rules as record_message_event: a repeat is a
-- no-op, an earlier status never moves a message backwards, and a failure is
-- terminal. A failure flags the number that was used.
create function public.record_text_status(
  provider_event_id text,
  provider_message_id text,
  status text,
  error_code text,
  occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event text := record_text_status.provider_event_id;
  v_provider text := record_text_status.provider_message_id;
  v_status text := record_text_status.status;
  v_code text := record_text_status.error_code;
  v_at timestamptz := coalesce(record_text_status.occurred_at, now());
  v_new public.message_status;
  v_msg public.messages;
  v_old_rank integer;
  v_new_rank integer;
  v_apply boolean;
begin
  if nullif(btrim(v_event), '') is null or nullif(btrim(v_provider), '') is null or v_status is null then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  v_new := case v_status
    when 'sending' then 'sending'
    when 'sent' then 'sent'
    when 'delivered' then 'delivered'
    when 'failed' then 'failed'
  end::public.message_status;
  if v_new is null then
    return 'ignored';
  end if;

  select * into v_msg
    from public.messages m
   where m.provider_message_id = v_provider and m.channel = 'text'
   for update;
  if not found then
    return 'unknown_message';
  end if;

  insert into public.message_events (provider_event_id, message_id, type, occurred_at)
    values (v_event, v_msg.id, 'twilio.' || v_status, v_at)
    on conflict (provider_event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  v_old_rank := case v_msg.status when 'queued' then 0 when 'sending' then 1 when 'sent' then 2 when 'delivered' then 3 end;
  v_new_rank := case v_new when 'sending' then 1 when 'sent' then 2 when 'delivered' then 3 end;
  v_apply := case
    when v_msg.status = 'skipped' then false
    when v_msg.status in ('bounced', 'complained', 'failed') then false
    when v_new = 'failed' then true
    else v_new_rank > v_old_rank
  end;

  update public.messages m
     set status = case when v_apply then v_new else m.status end,
         error_code = case when v_apply and v_new = 'failed' then v_code else m.error_code end,
         sent_at = case when v_apply and v_new = 'sent' then coalesce(m.sent_at, v_at) else m.sent_at end,
         last_event_at = greatest(coalesce(m.last_event_at, v_at), v_at)
   where m.id = v_msg.id;

  if v_apply and v_new = 'failed' and v_msg.household_id is not null then
    update public.household_contacts c
       set delivery_problem = true
     where c.household_id = v_msg.household_id
       and c.kind = 'phone'
       and c.value::text is not distinct from v_msg.to_phone;
  end if;

  return case when v_apply then 'applied' else 'ignored' end;
end;
$$;

revoke execute on function public.record_text_status(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_text_status(text, text, text, text, timestamptz) to service_role;
