-- Messaging: message types, campaigns (a send to an audience), per-household
-- messages, and provider delivery events. Staff read all four tables and write
-- campaigns; messages and events are written by the sender (service role) and
-- by the functions in the next migration. Guests and visitors see nothing.
--
-- Error codes raised here (SQLSTATE P0001, message is the code):
-- invalid_status_transition, campaign_locked.

-- A fixed set of message kinds. `template_key` names a template in the
-- registry (content is supplied separately). Essential types still reach a
-- household that opted out of reminders: the invitation and save-the-date,
-- and logistics updates.
create table public.message_types (
  key text primary key,
  label text not null,
  is_essential boolean not null default false,
  template_key text not null
);

insert into public.message_types (key, label, is_essential, template_key) values
  ('save_the_date', 'Save the date', true, 'save_the_date'),
  ('invitation', 'Invitation', true, 'invitation'),
  ('rsvp_reminder', 'RSVP reminder', false, 'rsvp_reminder'),
  ('optional_events_reminder', 'Optional events reminder', false, 'optional_events_reminder'),
  ('update', 'Update', true, 'update');

-- Mirrors contracts/audience-filter.md and the zod schema in
-- src/lib/campaigns/audience.ts: scope `all` takes nothing else, `household`
-- takes only a household id, `filter` takes a non-empty set of known filters.
create function public.is_valid_audience(audience jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_scope text;
  v_filters jsonb;
  v_key text;
  v_value jsonb;
  v_keys text[];
begin
  if audience is null or jsonb_typeof(audience) <> 'object' then
    return false;
  end if;
  if jsonb_typeof(audience -> 'scope') is distinct from 'string' then
    return false;
  end if;
  v_scope := audience ->> 'scope';
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(audience) as k;

  if v_scope = 'all' then
    return v_keys = array['scope'];
  elsif v_scope = 'household' then
    return v_keys = array['household_id', 'scope']
      and jsonb_typeof(audience -> 'household_id') = 'string'
      and (audience ->> 'household_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  elsif v_scope = 'filter' then
    if v_keys <> array['filters', 'scope'] or jsonb_typeof(audience -> 'filters') is distinct from 'object' then
      return false;
    end if;
    v_filters := audience -> 'filters';
    if not exists (select 1 from jsonb_object_keys(v_filters)) then
      return false;
    end if;
    for v_key, v_value in select * from jsonb_each(v_filters) loop
      if v_key in ('invited_to_event', 'optional_event_unanswered') then
        if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
          return false;
        end if;
      elsif v_key = 'not_yet_sent_message_type' then
        if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^[a-z][a-z0-9_]*$' then
          return false;
        end if;
      elsif v_key in ('required_events_unanswered', 'meals_not_chosen', 'delivery_problem') then
        if v_value <> 'true'::jsonb then
          return false;
        end if;
      else
        return false;
      end if;
    end loop;
    return true;
  end if;
  return false;
end;
$$;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  message_type_key text not null references public.message_types (key),
  name text not null,
  audience jsonb not null,
  status public.campaign_status not null default 'draft',
  scheduled_for timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_audience_valid check (public.is_valid_audience(audience)),
  constraint campaigns_scheduled_has_time check (status <> 'scheduled' or scheduled_for is not null)
);

create index campaigns_status_scheduled_idx on public.campaigns (status, scheduled_for);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- The campaign lifecycle: draft -> scheduled -> sending -> done, and
-- draft | scheduled -> cancelled. Sending straight from draft ("send now") is
-- allowed for the sender. Content (type, name, audience, send time) can be
-- edited only while draft or scheduled. Signed-in staff may only draft,
-- schedule, and cancel; sending and done belong to the sender (service role or
-- system, which have no signed-in user).
create function public.campaigns_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_by_staff boolean := auth.uid() is not null;
begin
  if tg_op = 'INSERT' then
    if v_by_staff and new.status not in ('draft', 'scheduled') then
      raise exception 'invalid_status_transition' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('scheduled', 'cancelled'))
      or (old.status = 'scheduled' and new.status in ('cancelled'))
      or (not v_by_staff and old.status in ('draft', 'scheduled') and new.status = 'sending')
      or (not v_by_staff and old.status = 'sending' and new.status = 'done')
    ) then
      raise exception 'invalid_status_transition' using errcode = 'P0001';
    end if;
  end if;

  if old.status in ('sending', 'done', 'cancelled') and (
    new.message_type_key is distinct from old.message_type_key
    or new.name is distinct from old.name
    or new.audience is distinct from old.audience
    or new.scheduled_for is distinct from old.scheduled_for
  ) then
    raise exception 'campaign_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger campaigns_guard
  before insert or update on public.campaigns
  for each row execute function public.campaigns_guard();

create trigger campaigns_audit
  after insert or update or delete on public.campaigns
  for each row execute function public.audit_row_change();

-- One row per household per campaign. `to_email` is the address actually used,
-- written when the message is claimed for sending (null while queued), and
-- forgotten when the household is deleted.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  to_email extensions.citext,
  status public.message_status not null default 'queued',
  skip_reason text,
  provider_message_id text unique,
  error_code text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  last_event_at timestamptz,
  constraint messages_campaign_household_unique unique (campaign_id, household_id),
  constraint messages_skip_reason_known
    check (skip_reason in ('no_email', 'opted_out', 'already_responded', 'household_missing', 'other'))
);

create index messages_campaign_status_idx on public.messages (campaign_id, status);
create index messages_household_id_idx on public.messages (household_id);

-- Deleting a household keeps the message (so counts stay right) but forgets
-- the address. The foreign key already nulls household_id.
create function public.households_forget_message_addresses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set to_email = null where household_id = old.id;
  return old;
end;
$$;

create trigger households_forget_message_addresses
  before delete on public.households
  for each row execute function public.households_forget_message_addresses();

-- Provider notifications. `provider_event_id` (the Svix id) makes a redelivery
-- a no-op. No payload body is kept.
create table public.message_events (
  id bigint generated always as identity primary key,
  provider_event_id text not null unique,
  message_id uuid not null references public.messages (id) on delete cascade,
  type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index message_events_message_id_idx on public.message_events (message_id);

-- Row-level security: staff only.
alter table public.message_types enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
alter table public.message_events enable row level security;

revoke all on public.message_types, public.campaigns, public.messages, public.message_events
  from anon, authenticated;
grant select on public.message_types, public.messages, public.message_events to authenticated;
grant select on public.campaigns to authenticated;
grant insert (id, message_type_key, name, audience, status, scheduled_for) on public.campaigns to authenticated;
grant update (message_type_key, name, audience, status, scheduled_for) on public.campaigns to authenticated;

create policy message_types_staff_select on public.message_types
  for select to authenticated using (public.is_staff());
create policy campaigns_staff_select on public.campaigns
  for select to authenticated using (public.is_staff());
create policy campaigns_staff_insert on public.campaigns
  for insert to authenticated with check (public.is_staff());
create policy campaigns_staff_update on public.campaigns
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy messages_staff_select on public.messages
  for select to authenticated using (public.is_staff());
create policy message_events_staff_select on public.message_events
  for select to authenticated using (public.is_staff());
