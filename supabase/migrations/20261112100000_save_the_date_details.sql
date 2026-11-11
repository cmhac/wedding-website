-- Save the date details, first opened, and test campaigns
-- (specs/006-save-the-date-outreach/data-model.md).
--
-- The card's place line and note live on the one settings row; the date is the
-- wedding event's date, read as a calendar date in the couple's time zone, so
-- no time zone can move it. A revision number goes up when the place, note or
-- wedding event changes; it becomes the calendar file's SEQUENCE.

alter table public.settings
  add column save_the_date_place text
    check (save_the_date_place is null or char_length(save_the_date_place) <= 200),
  add column save_the_date_note text
    check (save_the_date_note is null or char_length(save_the_date_note) <= 300),
  add column save_the_date_revision integer not null default 1;

create function private.settings_bump_save_the_date_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.save_the_date_place is distinct from old.save_the_date_place
     or new.save_the_date_note is distinct from old.save_the_date_note
     or new.wedding_event_id is distinct from old.wedding_event_id then
    new.save_the_date_revision := old.save_the_date_revision + 1;
  end if;
  return new;
end;
$$;

revoke execute on function private.settings_bump_save_the_date_revision() from public;

create trigger settings_b_bump_save_the_date_revision
  before update on public.settings
  for each row execute function private.settings_bump_save_the_date_revision();

-- get_save_the_date(): the card's facts for any signed-in guest or staff
-- member, and for the sender (service role). Guests cannot read `settings`, so this is the one way they get it.
-- Nothing about any household is returned.
create function public.get_save_the_date()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_event_set boolean;
begin
  -- No signed-in user means the service role (visitors cannot execute this):
  -- the sender reads the details to build a campaign. A signed-in caller is
  -- staff or a guest of a live session.
  if auth.uid() is not null and not public.is_staff() then
    perform private.my_household_id();
  end if;

  select (e.starts_at at time zone 'America/Los_Angeles')::date, true
    into v_date, v_event_set
    from public.settings s
    join public.events e on e.id = s.wedding_event_id
   where e.starts_at is not null;

  return (
    select jsonb_build_object(
      'couple_names', s.couple_names,
      'date', v_date,
      'place', s.save_the_date_place,
      'note', s.save_the_date_note,
      'revision', s.save_the_date_revision,
      'wedding_event_set', coalesce(v_event_set, false)
    )
    from public.settings s
  );
end;
$$;

revoke execute on function public.get_save_the_date() from public, anon;
grant execute on function public.get_save_the_date() to authenticated, service_role;

-- First opened: when a signed-in guest's device first loaded a site page. Set
-- once; staff previews never set it. Guests cannot read the column (the
-- column grants on households do not list it); staff read it through
-- staff_households().
alter table public.households add column first_opened_at timestamptz;

create function public.record_household_opened()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_staff() then
    return;
  end if;
  update public.households h
     set first_opened_at = now()
   where h.auth_user_id = auth.uid()
     and h.first_opened_at is null
     and private.session_is_live();
end;
$$;

revoke execute on function public.record_household_opened() from public, anon;
grant execute on function public.record_household_opened() to authenticated;

-- Test campaigns: a rehearsal send, ignored by the "not yet sent" filter. Like
-- the channel, it is content and cannot change once a campaign is sending.
alter table public.campaigns
  add column is_test boolean not null default false;

grant insert (is_test) on public.campaigns to authenticated;
grant update (is_test) on public.campaigns to authenticated;

create function private.campaigns_lock_is_test()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('sending', 'done', 'cancelled')
     and new.is_test is distinct from old.is_test then
    raise exception 'campaign_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.campaigns_lock_is_test() from public;

create trigger campaigns_lock_is_test
  before update of is_test on public.campaigns
  for each row execute function private.campaigns_lock_is_test();
