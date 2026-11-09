-- Sign out everywhere (research R10). Guests stay signed in indefinitely, so
-- staff need a way to end every session of a household at once, and the end
-- must take effect on the next request, not when an access token expires.
--
-- 1. A guest's access now also requires that the session named in their access
--    token (`session_id`) still exists in auth.sessions.
-- 2. revoke_household_sessions deletes the household's sessions (refresh tokens
--    go with them), so every device loses access immediately.

-- True when the caller's access token names a session that still exists.
create function private.session_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from auth.sessions s
       where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    ),
    false
  );
$$;

revoke execute on function private.session_is_live() from public;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.households
   where auth_user_id = auth.uid() and private.session_is_live();
$$;

-- The guest's own household row follows the same rule.
drop policy households_guest_select on public.households;
create policy households_guest_select on public.households
  for select to authenticated using (id = public.current_household_id());

-- The household the guest functions answer for.
create or replace function private.my_household_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select h.id into v_id from public.households h
   where h.auth_user_id = auth.uid() and private.session_is_live();
  if v_id is null then
    raise exception 'not_a_guest' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- revoke_household_sessions(household_id): service role only (the admin route
-- calls it after checking the caller is staff).
create function public.revoke_household_sessions(household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid;
  v_found boolean;
begin
  select h.auth_user_id, true into v_auth, v_found
    from public.households h where h.id = revoke_household_sessions.household_id;
  if v_found is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_auth is not null then
    delete from auth.sessions where user_id = v_auth;
  end if;
end;
$$;

revoke execute on function public.revoke_household_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_household_sessions(uuid) to service_role;
