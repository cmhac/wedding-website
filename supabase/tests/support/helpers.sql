-- Reusable pgTAP helpers. A test file loads them with:
--
--   \set helpers_included 1
--   \ir ../support/helpers.sql
--
-- `supabase test db` runs every .sql file under supabase/tests, including this
-- one. When run on its own (helpers_included not set) the file wraps itself in
-- a transaction and reports a single passing test, so nothing is left behind.
-- All objects are created inside the including test's transaction and are
-- rolled back with it.
\if :{?helpers_included}
\else
begin;
\endif

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Creates a fake auth user and returns its id. Only fake addresses belong here.
create or replace function tests.create_user(email text)
returns uuid
language plpgsql
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated',
    'authenticated', email, '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );
  return new_id;
end;
$$;

-- Acts as a signed-in user: role authenticated plus JWT claims.
create or replace function tests.authenticate_as(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  set local role authenticated;
end;
$$;

-- Acts as a visitor who is not signed in.
create or replace function tests.authenticate_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end;
$$;

-- Back to the test runner's own role, with no signed-in user.
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

\if :{?helpers_included}
\else
select plan(1);
select has_function('tests', 'create_user', array['text'], 'helpers load');
select * from finish();
rollback;
\endif
