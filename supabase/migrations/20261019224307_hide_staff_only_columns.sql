-- Staff-only columns must not be readable by signed-in guests, who share the
-- `authenticated` database role with staff and can query the tables directly
-- through the data API. Row-level security limits guests to their own rows but
-- not to particular columns, so column privileges do the rest.
--
-- Hidden from `authenticated`: the private notes on households and guests, the
-- delivery problem flag, the deadline override and postal address of a
-- household, and who invited or answered an invitation. Staff read the full rows
-- through the staff_households, staff_guests and staff_invitations functions
-- (security definer, staff only) and still write these columns directly.

revoke select on public.households, public.guests, public.invitations from authenticated;

grant select (
  id, display_name, contact_email, auth_user_id, plus_one_allowance,
  reminders_opt_out, message_to_couple, created_at, updated_at
) on public.households to authenticated;

grant select (
  id, household_id, first_name, last_name, email, is_placeholder, is_plus_one,
  dietary_notes, created_at, updated_at
) on public.guests to authenticated;

grant select (guest_id, event_id, status, responded_at, invited_at)
  on public.invitations to authenticated;

create function public.staff_households()
returns setof public.households
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return query select * from public.households;
end;
$$;

create function public.staff_guests()
returns setof public.guests
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return query select * from public.guests;
end;
$$;

create function public.staff_invitations()
returns setof public.invitations
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return query select * from public.invitations;
end;
$$;

revoke execute on function
  public.staff_households(), public.staff_guests(), public.staff_invitations()
from public, anon;
grant execute on function
  public.staff_households(), public.staff_guests(), public.staff_invitations()
to authenticated, service_role;

-- A household can be linked to a staff member's sign-in account only by the
-- couple (or the service role, which has no signed-in user). Without this the
-- planner could link a household to a couple account and then take it over by
-- changing the household's contact email.
create function private.households_refuse_staff_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is not null
     and (tg_op = 'INSERT' or new.auth_user_id is distinct from old.auth_user_id)
     and auth.uid() is not null
     and not public.is_couple()
     and exists (select 1 from public.staff s where s.user_id = new.auth_user_id)
  then
    raise exception 'staff_account' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.households_refuse_staff_account() from public;

create trigger households_refuse_staff_account
  before insert or update of auth_user_id on public.households
  for each row execute function private.households_refuse_staff_account();
