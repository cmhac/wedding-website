-- create_household_record, delete_household_record, add/update/remove_household_contact:
-- staff-only writes that attribute the change to the signed-in staff member.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(30);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-new@example.test') as user_new \gset

insert into public.staff (user_id, role, display_name) values
  (:'staff_user', 'couple', 'Staff'), (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, auth_user_id, delivery_problem) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a', true),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', null, false),
  -- the planner is also a guest: their household is linked to the staff account
  ('cccccccc-0000-0000-0000-00000000000c', 'Planner Household', :'planner_user', false);
insert into public.household_contacts (household_id, kind, value, delivery_problem) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'a@example.test', true),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'b@example.test', false),
  ('cccccccc-0000-0000-0000-00000000000c', 'email', 'planner.household@example.test', false);
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
select throws_ok($$select public.add_household_contact('bbbbbbbb-0000-0000-0000-00000000000b', 'x@example.test')$$,
  'P0001', 'forbidden', 'a guest cannot add a household address');
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
  {"display_name": "Created Household", "contacts": ["created@example.test"], "auth_user_id": "%s",
   "address": {"street": "1 Example Road"}, "notes": "staff only", "plus_one_allowance": 1,
   "guests": [
     {"first_name": "Cy", "last_name": "Created", "events": ["event-one"]},
     {"is_placeholder": true, "events": ["event-one"]}
   ]}$json$, :'user_new')::jsonb)::text as res \gset
select tests.clear_auth();

select is(jsonb_array_length((:'res'::jsonb) -> 'guest_ids'), 2, 'create returns the guest ids');
select is((:'res'::jsonb) ->> 'invitations', '2', 'create returns the invitation count');
select results_eq(
  format($$select h.display_name, (select string_agg(c.value::text, ',') from public.household_contacts c where c.household_id = h.id), h.auth_user_id, h.plus_one_allowance, h.notes
             from public.households h where h.id = %L$$, (:'res'::jsonb) ->> 'household_id'),
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
  $$select public.create_household_record('{"display_name": "Clash", "contacts": ["A@example.test"], "guests": [{"first_name": "Z", "last_name": "Z"}]}'::jsonb)$$,
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

-- Address changes.
select tests.authenticate_as(:'staff_user');
select ok(
  public.add_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', 'Second@Example.test') is not null,
  'adding an address returns the new contact'
);
select public.update_household_contact(
  'aaaaaaaa-0000-0000-0000-00000000000a',
  (select id from public.household_contacts where value = 'a@example.test'),
  'New@Example.test'
);
select results_eq(
  $$select value::text, delivery_problem from public.household_contacts
     where household_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and value = 'new@example.test'$$,
  $$values ('new@example.test'::text, false)$$,
  'the changed address is stored lower-cased and its delivery problem flag is cleared'
);
select throws_ok(
  $$select public.update_household_contact('aaaaaaaa-0000-0000-0000-00000000000a',
      (select id from public.household_contacts where value = 'new@example.test'), 'b@example.test')$$,
  'P0001', 'email_in_use', 'an address used by another household is refused'
);
select throws_ok(
  $$select public.add_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', 'not an email')$$,
  'P0001', 'invalid_payload', 'an invalid address is refused'
);
select results_eq(
  $$select public.remove_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', id) ->> 'paper_only'
      from public.household_contacts where household_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
      order by value$$,
  $$values ('false'::text), ('true')$$,
  'removing the last address says the household is now paper only'
);
select throws_ok(
  $$select public.remove_household_contact('aaaaaaaa-0000-0000-0000-00000000000a', gen_random_uuid())$$,
  'P0001', 'not_found', 'removing an unknown address is not found'
);
select throws_ok(
  $$select public.add_household_contact('99999999-0000-0000-0000-000000000009', 'x@example.test')$$,
  'P0001', 'not_found', 'an unknown household is not_found'
);

-- Delete.
select is(
  (public.delete_household_record('cccccccc-0000-0000-0000-00000000000c')) ->> 'auth_user_is_staff',
  'true', 'deleting reports when the linked account belongs to a staff member'
);
select is(
  (public.delete_household_record('aaaaaaaa-0000-0000-0000-00000000000a')) ->> 'auth_user_id',
  :'user_a', 'deleting returns the household''s sign-in account so it can be removed'
);
select is(
  (public.delete_household_record('bbbbbbbb-0000-0000-0000-00000000000b')) ->> 'auth_user_id',
  null, 'a household with no sign-in account reports none'
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
