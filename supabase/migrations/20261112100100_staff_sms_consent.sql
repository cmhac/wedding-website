-- Staff-marked consent (specs/006-save-the-date-outreach/data-model.md).
--
-- The text-message feature let only a guest's own ticked box record an opt-in.
-- The couple now also record consent that guests gave before the site existed:
-- the couple or the planner, one number or a batch, or the guest-list import.
-- The record shows who, when and how. The column grants are unchanged: staff
-- still cannot write the consent columns directly, only through the functions
-- below.

alter table public.household_contacts
  add column sms_consent_by uuid references auth.users (id) on delete set null,
  add column sms_consent_note text,
  add column sms_consent_overrode_decline boolean not null default false;

alter table public.household_contacts
  add constraint household_contacts_consent_note_length
    check (sms_consent_note is null or char_length(sms_consent_note) <= 200);

alter table public.household_contacts
  drop constraint household_contacts_consent_source_known,
  drop constraint household_contacts_consent_complete;

alter table public.household_contacts
  add constraint household_contacts_consent_source_known
    check (sms_consent_source is null or sms_consent_source in ('first_sign_in', 'sign_in_prompt', 'staff', 'import')),
  add constraint household_contacts_consent_complete
    check (
      (sms_consent = 'not_asked'
        and sms_consent_at is null and sms_consent_source is null
        and sms_consent_by is null and sms_consent_note is null
        and not sms_consent_overrode_decline)
      or (sms_consent <> 'not_asked' and sms_consent_at is not null and sms_consent_source is not null)
    );

-- A changed number is a new number: everything about the old answer goes.
create or replace function private.household_contacts_reset_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sms_consent := 'not_asked';
  new.sms_consent_at := null;
  new.sms_consent_source := null;
  new.sms_consent_by := null;
  new.sms_consent_note := null;
  new.sms_consent_overrode_decline := false;
  return new;
end;
$$;

-- staff_set_sms_consent: mark or clear consent for one number, or for every
-- phone number of the chosen households, all or nothing. A dry run changes
-- nothing and returns the same counts. A declined number is skipped by a batch
-- unless override_declined is set; a single-number mark on a declined number
-- needs it too. Marking sends no text.
create function public.staff_set_sms_consent(
  household_ids uuid[],
  contact_id uuid default null,
  mode text default 'mark',
  override_declined boolean default false,
  note text default null,
  dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids uuid[] := staff_set_sms_consent.household_ids;
  v_contact uuid := staff_set_sms_consent.contact_id;
  v_mode text := staff_set_sms_consent.mode;
  v_override boolean := coalesce(staff_set_sms_consent.override_declined, false);
  v_dry boolean := coalesce(staff_set_sms_consent.dry_run, false);
  v_note text := nullif(btrim(coalesce(staff_set_sms_consent.note, '')), '');
  v_opted integer;
  v_declined integer;
  v_not_asked integer;
  v_without integer;
  v_marked integer := 0;
  v_cleared integer := 0;
  v_already integer := 0;
  v_skipped integer := 0;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_mode is null or v_mode not in ('mark', 'clear')
     or v_ids is null
     or coalesce(array_length(v_ids, 1), 0) = 0
     or array_length(v_ids, 1) > 1000
     or (v_note is not null and char_length(v_note) > 200) then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  if (select count(*) from public.households h where h.id = any (v_ids))
     <> (select count(distinct x) from unnest(v_ids) as x) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_contact is not null and not exists (
    select 1 from public.household_contacts c
     where c.id = v_contact and c.kind = 'phone' and c.household_id = any (v_ids)
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select count(*) filter (where c.sms_consent = 'opted_in'),
         count(*) filter (where c.sms_consent = 'declined'),
         count(*) filter (where c.sms_consent = 'not_asked')
    into v_opted, v_declined, v_not_asked
    from public.household_contacts c
   where c.kind = 'phone' and c.household_id = any (v_ids)
     and (v_contact is null or c.id = v_contact);

  if v_contact is null then
    select count(*) into v_without
      from public.households h
     where h.id = any (v_ids)
       and not exists (
         select 1 from public.household_contacts c
          where c.household_id = h.id and c.kind = 'phone'
       );
  else
    v_without := 0;
  end if;

  if v_mode = 'mark' then
    if v_contact is not null and v_declined > 0 and not v_override then
      raise exception 'declined_needs_override' using errcode = 'P0001';
    end if;
    v_already := v_opted;
    if v_override then
      v_marked := v_not_asked + v_declined;
    else
      v_marked := v_not_asked;
      v_skipped := v_declined;
    end if;
    if not v_dry then
      update public.household_contacts c
         set sms_consent = 'opted_in',
             sms_consent_at = now(),
             sms_consent_source = 'staff',
             sms_consent_by = auth.uid(),
             sms_consent_note = v_note,
             sms_consent_overrode_decline = (c.sms_consent = 'declined')
       where c.kind = 'phone' and c.household_id = any (v_ids)
         and (v_contact is null or c.id = v_contact)
         and (c.sms_consent = 'not_asked' or (v_override and c.sms_consent = 'declined'));
    end if;
  else
    v_cleared := v_opted + v_declined;
    v_already := v_not_asked;
    if not v_dry then
      update public.household_contacts c
         set sms_consent = 'not_asked',
             sms_consent_at = null,
             sms_consent_source = null,
             sms_consent_by = null,
             sms_consent_note = null,
             sms_consent_overrode_decline = false
       where c.kind = 'phone' and c.household_id = any (v_ids)
         and (v_contact is null or c.id = v_contact)
         and c.sms_consent <> 'not_asked';
    end if;
  end if;

  return jsonb_build_object(
    'marked', v_marked,
    'cleared', v_cleared,
    'already', v_already,
    'declined_skipped', v_skipped,
    'households_without_phone', v_without,
    'households', coalesce(array_length(v_ids, 1), 0),
    'dry_run', v_dry
  );
end;
$$;

revoke execute on function public.staff_set_sms_consent(uuid[], uuid, text, boolean, text, boolean)
  from public, anon;
grant execute on function public.staff_set_sms_consent(uuid[], uuid, text, boolean, text, boolean)
  to authenticated;

-- import_phone_consent: the guest-list import's mark for one number, recorded
-- as "import". Service role only; the import validates the number first.
create function public.import_phone_consent(
  household_id uuid,
  value text,
  marked_by uuid,
  override_declined boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_state public.sms_consent_state;
begin
  select c.id, c.sms_consent into v_id, v_state
    from public.household_contacts c
   where c.household_id = import_phone_consent.household_id
     and c.kind = 'phone'
     and c.value = import_phone_consent.value::extensions.citext;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_state = 'opted_in' then
    return jsonb_build_object('result', 'already');
  end if;
  if v_state = 'declined' and not coalesce(import_phone_consent.override_declined, false) then
    return jsonb_build_object('result', 'declined_skipped');
  end if;

  update public.household_contacts c
     set sms_consent = 'opted_in',
         sms_consent_at = now(),
         sms_consent_source = 'import',
         sms_consent_by = import_phone_consent.marked_by,
         sms_consent_overrode_decline = (v_state = 'declined')
   where c.id = v_id;
  return jsonb_build_object('result', 'marked');
end;
$$;

revoke execute on function public.import_phone_consent(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.import_phone_consent(uuid, text, uuid, boolean)
  to service_role;
