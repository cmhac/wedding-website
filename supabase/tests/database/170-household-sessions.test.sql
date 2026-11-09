-- Sign out everywhere. Verify-first check (research R10): deleting a user's
-- sessions removes their refresh tokens too. Then revoke_household_sessions and
-- the session check that makes a revoked session lose guest access at once.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(16);

select tests.create_user('household-sessions-a@example.test') as user_a \gset
select tests.create_user('household-sessions-b@example.test') as user_b \gset

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('aaaaaaaa-1700-0000-0000-000000000001', :'user_a', now(), now()),
  ('bbbbbbbb-1700-0000-0000-000000000001', :'user_b', now(), now());
insert into auth.refresh_tokens (instance_id, token, user_id, session_id, revoked) values
  ('00000000-0000-0000-0000-000000000000', 'fake-token-a', :'user_a'::text, 'aaaaaaaa-1700-0000-0000-000000000001', false),
  ('00000000-0000-0000-0000-000000000000', 'fake-token-b', :'user_b'::text, 'bbbbbbbb-1700-0000-0000-000000000001', false);

delete from auth.sessions where user_id = :'user_a';

select is(
  (select count(*)::int from auth.refresh_tokens where user_id = :'user_a'::text),
  0, 'deleting a user''s sessions removes their refresh tokens'
);
select is(
  (select count(*)::int from auth.refresh_tokens where user_id = :'user_b'::text),
  1, 'another user''s refresh tokens are untouched'
);

-- revoke_household_sessions and the session check.
select tests.create_user('household-sessions-c@example.test') as user_c \gset
insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-1700-0000-0000-00000000000a', 'Household A', :'user_a'),
  ('cccccccc-1700-0000-0000-00000000000c', 'Household C', :'user_c');
insert into public.household_contacts (household_id, kind, value) values
  ('aaaaaaaa-1700-0000-0000-00000000000a', 'email', 'a@example.test'),
  ('cccccccc-1700-0000-0000-00000000000c', 'email', 'c@example.test');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-1700-0000-0000-0000000000a1', 'aaaaaaaa-1700-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('cccccccc-1700-0000-0000-0000000000c1', 'cccccccc-1700-0000-0000-00000000000c', 'Cy', 'Gamma');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-1700-0000-0000-000000000001', 'ev', 'Event', true);
insert into public.invitations (guest_id, event_id) values
  ('aaaaaaaa-1700-0000-0000-0000000000a1', 'eeeeeeee-1700-0000-0000-000000000001');

-- A live session works.
select tests.authenticate_as(:'user_c');
select is(public.current_household_id(), 'cccccccc-1700-0000-0000-00000000000c'::uuid, 'a live session reaches its household');
select is((select count(*)::int from public.households), 1, 'and reads its household row');
select tests.clear_auth();

-- A token whose session is not in auth.sessions reaches nothing.
select tests.authenticate_as_session(:'user_c', gen_random_uuid());
select is(public.current_household_id(), null, 'a session that does not exist gives no household');
select is((select count(*)::int from public.households), 0, 'and no household row');
select is((select count(*)::int from public.household_contacts), 0, 'no contacts');
select is((select count(*)::int from public.guests), 0, 'no guests');
select is((select count(*)::int from public.invitations), 0, 'no invitations');
select throws_ok($$select public.get_my_rsvp()$$, 'P0001', 'not_a_guest', 'and the guest functions refuse it');
select tests.clear_auth();

-- A token with no session claim at all reaches nothing either.
select tests.authenticate_as(:'user_a');
select set_config('request.jwt.claims', json_build_object('sub', :'user_a'::text, 'role', 'authenticated')::text, true);
select is(public.current_household_id(), null, 'a token without a session id gives no household');
select tests.clear_auth();

-- Revoking.
select tests.authenticate_as(:'user_a');
select is((select count(*)::int from public.guests), 1, 'before revoking, the household reads its guest');
select tests.clear_auth();
select count(*) as sessions_c_before from auth.sessions where user_id = :'user_c' \gset
select tests.authenticate_service_role();
select public.revoke_household_sessions('aaaaaaaa-1700-0000-0000-00000000000a');
select tests.clear_auth();
select is((select count(*)::int from auth.sessions where user_id = :'user_a'), 0, 'revoking deletes the household''s sessions');
select is(
  (select count(*)::int from auth.sessions where user_id = :'user_c'), :sessions_c_before::int,
  'and only that household''s'
);

select throws_ok(
  $$select public.revoke_household_sessions('99999999-1700-0000-0000-000000000009')$$,
  'P0001', 'not_found', 'an unknown household is not_found'
) ;
select ok(
  has_function_privilege('service_role', 'public.revoke_household_sessions(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.revoke_household_sessions(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.revoke_household_sessions(uuid)', 'EXECUTE'),
  'only the service role can revoke'
);

select * from finish();
rollback;
