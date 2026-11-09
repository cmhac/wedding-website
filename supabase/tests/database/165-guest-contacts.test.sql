-- get_my_contacts(): a guest reads their own household's addresses (the guest
-- API masks them); nobody else's, and anon and staff-without-household get
-- not_a_guest.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(6);

select tests.create_user('household-a@households.invalid') as user_a \gset
select tests.create_user('household-b@households.invalid') as user_b \gset
select tests.create_user('stranger@example.test') as stranger \gset

insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', :'user_b');
insert into public.household_contacts (household_id, kind, value, created_at) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'a1@example.test', '2027-01-01T00:00:01Z'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'a2@example.test', '2027-01-01T00:00:02Z'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'b1@example.test', '2027-01-01T00:00:03Z');

select tests.authenticate_as(:'user_a');
select is(
  public.get_my_contacts(),
  '[{"kind": "email", "value": "a1@example.test"}, {"kind": "email", "value": "a2@example.test"}]'::jsonb,
  'a guest gets their own household''s addresses, oldest first'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.get_my_contacts()) e where e ->> 'value' like 'b1%'),
  0, 'and no other household''s'
);
select tests.clear_auth();

select tests.authenticate_as(:'user_b');
select is(jsonb_array_length(public.get_my_contacts()), 1, 'another household gets only its own');
select tests.clear_auth();

select tests.authenticate_as(:'stranger');
select throws_ok($$select public.get_my_contacts()$$, 'P0001', 'not_a_guest', 'a user with no household gets not_a_guest');
select tests.clear_auth();

select tests.authenticate_anon();
select throws_ok($$select public.get_my_contacts()$$, 'P0001', 'not_a_guest', 'anon gets not_a_guest');
select tests.clear_auth();

select ok(
  has_function_privilege('authenticated', 'public.get_my_contacts()', 'EXECUTE')
  and not has_function_privilege('public', 'public.get_my_contacts()', 'EXECUTE'),
  'signed-in users can execute it, the public role cannot'
);

select * from finish();
rollback;
