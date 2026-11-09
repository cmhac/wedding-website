-- A household cannot be linked to a staff member's sign-in account by anyone but
-- the couple, so the planner cannot take over a couple account by changing a household's
-- sign-in account.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(7);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'), (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a');
insert into public.household_contacts (household_id, kind, value, delivery_problem) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'a@example.test', false);

select tests.authenticate_as(:'planner_user');
select throws_ok(
  format($$update public.households set auth_user_id = %L where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, :'couple_user'),
  '42501', null, 'the planner cannot link a household to the couple account directly'
);
select throws_ok(
  format($$select public.create_household_record(jsonb_build_object('display_name', 'New', 'contacts', jsonb_build_array('new@example.test'), 'auth_user_id', %L::text, 'guests', jsonb_build_array(jsonb_build_object('first_name', 'Ann', 'last_name', 'New'))))$$, :'couple_user'),
  'P0001', 'staff_account', 'the planner cannot create a household linked to the couple account'
);
select lives_ok(
  $$select public.add_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', 'a2@example.test')$$,
  'the planner can still add an address to the household'
);
select tests.clear_auth();

select is(
  (select auth_user_id from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  :'user_a'::uuid, 'the household is still linked to its own account'
);

select tests.authenticate_as(:'couple_user');
select lives_ok(
  $$select public.add_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', 'a3@example.test')$$,
  'the couple can add an address to the household'
);
select tests.clear_auth();

select tests.authenticate_service_role();
select lives_ok(
  format($$update public.households set auth_user_id = %L where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, :'couple_user'),
  'the service role is not restricted by the check'
);
select tests.clear_auth();
select is(
  (select auth_user_id from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  :'couple_user'::uuid, 'the service role link took effect'
);

select * from finish();
rollback;
