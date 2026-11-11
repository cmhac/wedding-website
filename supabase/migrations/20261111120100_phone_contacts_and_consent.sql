-- Phone contacts and the opt-in record (specs/005-sms-support/data-model.md).
--
-- A phone number is a household_contacts row of kind 'phone', stored as E.164
-- (+12025550123). Whether it is a United States number is checked by the server
-- (the database cannot tell Canada from the US without a hand-kept area-code
-- list); the database checks the shape and uniqueness.
--
-- Each number carries its own opt-in record: not_asked, opted_in or declined,
-- with when and where. It resets when the number changes, goes when the number
-- goes, and can be set only by the two consent functions in a later migration:
-- the table-wide update grant is replaced by a grant on `value` alone, and
-- direct staff writes are limited to email rows. Phone rows are written only by
-- service-role functions after the server has validated the number.

create type public.sms_consent_state as enum ('not_asked', 'opted_in', 'declined');

alter table public.household_contacts
  add column sms_consent public.sms_consent_state not null default 'not_asked',
  add column sms_consent_at timestamptz,
  add column sms_consent_source text;

alter table public.household_contacts
  add constraint household_contacts_phone_shape
    check (kind <> 'phone' or value::text ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  add constraint household_contacts_consent_source_known
    check (sms_consent_source is null or sms_consent_source in ('first_sign_in', 'sign_in_prompt')),
  add constraint household_contacts_consent_only_phone
    check (kind = 'phone' or sms_consent = 'not_asked'),
  add constraint household_contacts_consent_complete
    check (
      (sms_consent = 'not_asked' and sms_consent_at is null and sms_consent_source is null)
      or (sms_consent <> 'not_asked' and sms_consent_at is not null and sms_consent_source is not null)
    );

-- A new number starts with no answer, as a new address starts without a delivery problem.
create function private.household_contacts_reset_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sms_consent := 'not_asked';
  new.sms_consent_at := null;
  new.sms_consent_source := null;
  return new;
end;
$$;

revoke execute on function private.household_contacts_reset_consent() from public;

create trigger household_contacts_d_reset_consent
  before update of value on public.household_contacts
  for each row
  when (new.value is distinct from old.value)
  execute function private.household_contacts_reset_consent();

-- Who can write what. Postgres cannot take a column back from a table-wide
-- grant, so replace the grants: staff may add rows (household, kind, value) and
-- change `value` only; the opt-in columns and the delivery flag are set by
-- functions and triggers.
revoke insert, update on public.household_contacts from authenticated;
grant insert (household_id, kind, value) on public.household_contacts to authenticated;
grant update (value) on public.household_contacts to authenticated;

-- Direct staff writes are for email only; phone rows go through the service-role functions.
drop policy household_contacts_staff_all on public.household_contacts;
create policy household_contacts_staff_select on public.household_contacts
  for select to authenticated using (public.is_staff());
create policy household_contacts_staff_write_email on public.household_contacts
  for insert to authenticated with check (public.is_staff() and kind = 'email');
create policy household_contacts_staff_update_email on public.household_contacts
  for update to authenticated
  using (public.is_staff() and kind = 'email')
  with check (public.is_staff() and kind = 'email');
create policy household_contacts_staff_delete_email on public.household_contacts
  for delete to authenticated using (public.is_staff() and kind = 'email');

-- The couple's on/off switch for texting. Configured is a fact about the
-- deployment (environment settings), not stored here.
alter table public.settings add column sms_enabled boolean not null default false;

-- Any staff member can update the other settings; only the couple turns texting on or off.
create function private.settings_guard_sms_switch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sms_enabled is distinct from old.sms_enabled
     and auth.uid() is not null
     and not public.is_couple() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.settings_guard_sms_switch() from public;

create trigger settings_guard_sms_switch
  before update of sms_enabled on public.settings
  for each row execute function private.settings_guard_sms_switch();
