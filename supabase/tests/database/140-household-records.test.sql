-- create_household_record, delete_household_record, set_household_contact:
-- staff-only writes that attribute the change to the signed-in staff member.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(28);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-new@example.test') as user_new \gset

insert into public.staff (user_id, role, display_name) values
  (:'staff_user', 'couple', 'Staff'), (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, contact_email, auth_user_id, delivery_problem) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a', true),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', null, false),
  -- the planner is also a guest: their household is linked to the staff account
  ('cccccccc-0000-0000-0000-00000000000c', 'Planner Household', 'planner@example.test', :'planner_user', false);
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('cccccccc-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-00000000000c', 'Pia', 'Planner');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true);
insert into public.invitations (guest_id, event_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001');

-- Not staff: guests are refused, anon and the service role cannot even try.
select tests.authenticate_as(:'user_a');
select throws_ok($$select public.create_household_record('{"display_name": "X", "guests": []}'::jsonb)$$,
  'P0001', 'forbidden', 'a guest cannot create a household');
select throws_ok($$select public.delete_household_record('bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'P0001', 'forbidden', 'a guest cannot delete a household');
select throws_ok($$select public.set_household_contact('bbbbbbbb-0000-0000-0000-00000000000b', null, null)$$,
  'P0001', 'forbidden', 'a guest cannot change a household contact');
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok($$select public.delete_household_record('bbbbbbbb-0000-0000-0000-00000000000b')$$,
  '42501', null, 'anon cannot delete a household');
select tests.clear_auth();
select tests.authenticate_service_role();
select throws_ok($$select public.delete_household_record('bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'P0001', 'forbidden', 'the service role is refused: these records must name the acting staff member');
select tests.clear_auth();

-- Create.
select tests.authenticate_as(:'staff_user');
select public.create_household_record(format($json$
  {"display_name": "Created Household", "contact_email": "created@example.test", "auth_user_id": "%s",
   "address": {"street": "1 Example Road"}, "notes": "staff only", "plus_one_allowance": 1,
   "guests": [
     {"first_name": "Cy", "last_name": "Created", "events": ["event-one"]},
     {"is_placeholder": true, "events": ["event-one"]}
   ]}$json$, :'user_new')::jsonb)::text as res \gset
select tests.clear_auth();

select is(jsonb_array_length((:'res'::jsonb) -> 'guest_ids'), 2, 'create returns the guest ids');
select is((:'res'::jsonb) ->> 'invitations', '2', 'create returns the invitation count');
select results_eq(
  format($$select display_name, contact_email::text, auth_user_id, plus_one_allowance, notes
             from public.households where id = %L$$, (:'res'::jsonb) ->> 'household_id'),
  format($$values ('Created Household'::text, 'created@example.test'::text, %L::uuid, 1::smallint, 'staff only'::text)$$, :'user_new'),
  'the household is stored with its sign-in account link'
);
select is(
  (select count(*) from public.guests where is_placeholder and is_plus_one
     and household_id::text = (:'res'::jsonb) ->> 'household_id'),
  1::bigint, 'a placeholder plus-one seat can be created within the allowance'
);
select results_eq(
  format($$select actor_kind, actor_user_id from public.audit_log
            where entity = 'households' and action = 'insert' and entity_id = %L$$, (:'res'::jsonb) ->> 'household_id'),
  format($$values ('couple'::text, %L::uuid)$$, :'staff_user'),
  'the creation is attributed to the acting staff member'
);

select tests.authenticate_as(:'staff_user');
select throws_ok(
  $$select public.create_household_record('{"display_name": "Clash", "contact_email": "A@example.test", "guests": [{"first_name": "Z", "last_name": "Z"}]}'::jsonb)$$,
  'P0001', 'email_in_use', 'a contact email used by another household is refused with email_in_use'
);
select throws_ok(
  $$select public.create_household_record('{"display_name": "", "guests": []}'::jsonb)$$,
  'P0001', 'invalid_payload', 'an invalid household is refused with invalid_payload'
);
select throws_ok(
  $$select public.create_household_record('{"display_name": "Too Many", "plus_one_allowance": 0, "guests": [{"is_placeholder": true}]}'::jsonb)$$,
  'P0001', 'invalid_payload', 'more plus-one seats than the allowance is refused'
);
select tests.clear_auth();
select is((select count(*) from public.households), 4::bigint, 'refused creations leave nothing behind');

-- Staff can still update the other household columns directly.
select tests.authenticate_as(:'planner_user');
select lives_ok(
  $$update public.households set display_name = 'Household B (renamed)', notes = 'n',
      plus_one_allowance = 1, reminders_opt_out = true
    where id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$,
  'staff update non-email household columns directly'
);
select tests.clear_auth();
select results_eq(
  $$select actor_kind from public.audit_log where entity = 'households' and action = 'update'
      and entity_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$,
  $$values ('planner'::text)$$,
  'and the change is attributed to the planner'
);

-- Contact change.
select tests.authenticate_as(:'staff_user');
select is(
  (public.set_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', 'New@Example.test', :'user_a')) ->> 'previous_auth_user_id',
  :'user_a', 'changing the email returns the previously linked account'
);
select results_eq(
  $$select contact_email::text, delivery_problem from public.staff_households() where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  $$values ('New@Example.test'::text, false)$$,
  'the new email is stored and the delivery problem flag is cleared'
);
select throws_ok(
  $$select public.set_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', 'b@example.test', null)$$,
  'P0001', 'email_in_use', 'an email used by another household is refused'
);
select throws_ok(
  $$select public.set_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', 'not an email', null)$$,
  'P0001', 'invalid_payload', 'an invalid email is refused'
);
select public.set_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', null, null);
select results_eq(
  $$select contact_email is null, auth_user_id is null from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  $$values (true, true)$$,
  'clearing the email unlinks the sign-in account (paper-only)'
);
select throws_ok(
  $$select public.set_household_contact('99999999-0000-0000-0000-000000000009', null, null)$$,
  'P0001', 'not_found', 'an unknown household is not_found'
);

-- Delete.
select is(
  (public.delete_household_record('cccccccc-0000-0000-0000-00000000000c')) ->> 'auth_user_is_staff',
  'true', 'deleting reports when the linked account belongs to a staff member'
);
select is(
  (public.delete_household_record('aaaaaaaa-0000-0000-0000-00000000000a')) ->> 'auth_user_id',
  null, 'a household whose sign-in account was unlinked reports none'
);
select throws_ok(
  $$select public.delete_household_record('aaaaaaaa-0000-0000-0000-00000000000a')$$,
  'P0001', 'not_found', 'deleting twice is not_found'
);
select tests.clear_auth();
select is(
  (select count(*) from public.guests where household_id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000c')),
  0::bigint, 'deleting a household removes its guests'
);
select is(
  (select count(*) from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  0::bigint, 'and their invitations'
);
select results_eq(
  $$select actor_kind from public.audit_log where entity = 'households' and action = 'delete'
      and entity_id = 'cccccccc-0000-0000-0000-00000000000c'$$,
  $$values ('couple'::text)$$,
  'the deletion is attributed to the acting staff member'
);

select * from finish();
rollback;
