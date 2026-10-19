-- archive_dish and staff_set_meal.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(27);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'planner', 'Staff');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bob', 'Beta');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dinner', 'Dinner', true);
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'eeeeeeee-0000-0000-0000-000000000001', 'declined');
insert into public.menus (id, event_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'draft');
insert into public.courses (id, menu_id, name, display_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Main', 1);
insert into public.dishes (id, course_id, name) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Fish'),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'Beef');

-- Not staff.
select tests.authenticate_as(:'user_a');
select throws_ok($$select * from public.archive_dish('33333333-0000-0000-0000-000000000001')$$, 'P0001', 'forbidden', 'a guest cannot archive a dish');
select throws_ok(
  $$select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')$$,
  'P0001', 'forbidden', 'a guest cannot use staff_set_meal'
);
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok($$select * from public.archive_dish('33333333-0000-0000-0000-000000000001')$$, '42501', null, 'anon cannot archive a dish');
select throws_ok(
  $$select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot use staff_set_meal'
);
select tests.clear_auth();

-- staff_set_meal works on a draft menu and is attributed to the staff member.
select tests.authenticate_as(:'staff_user');
select is(
  (public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')) ->> 'dish_id',
  '33333333-0000-0000-0000-000000000001', 'staff can choose for a guest, even on a draft menu'
);
select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001');
select public.staff_set_meal('bbbbbbbb-0000-0000-0000-0000000000b1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001');
select tests.clear_auth();
select results_eq(
  $$select chosen_by from public.meal_selections where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'$$,
  format($$values (%L::uuid)$$, :'staff_user'), 'the staff member is recorded as chosen_by'
);
select results_eq(
  $$select actor_kind from public.audit_log where entity = 'meal_selections' and action = 'insert' limit 1$$,
  $$values ('planner'::text)$$, 'and in the audit log'
);

select tests.authenticate_as(:'staff_user');
select is(
  (public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002')) ->> 'dish_id',
  '33333333-0000-0000-0000-000000000002', 'staff can change a choice'
);
select throws_ok(
  $$select public.staff_set_meal('bbbbbbbb-0000-0000-0000-0000000000b2', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')$$,
  'P0001', 'invalid_meal', 'staff cannot choose for a guest who declined'
);
select throws_ok(
  $$select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000009')$$,
  'P0001', 'invalid_meal', 'staff cannot choose a dish that does not exist'
);
select throws_ok(
  $$select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '99999999-0000-0000-0000-000000000009', '33333333-0000-0000-0000-000000000001')$$,
  'P0001', 'not_found', 'an unknown course is not_found'
);
select throws_ok(
  $$select public.staff_set_meal('99999999-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')$$,
  'P0001', 'not_found', 'an unknown guest is not_found'
);
select is(
  (public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', null)) ->> 'dish_id',
  null, 'staff can clear a choice with a null dish'
);
select tests.clear_auth();
select results_eq(
  $$select old_dish_id::text, new_dish_id is null, reason from public.meal_selection_history
     where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' order by id desc limit 1$$,
  $$values ('33333333-0000-0000-0000-000000000002'::text, true, 'changed'::text)$$,
  'clearing a choice is written to the history'
);
-- Put Ada back on the Fish.
select tests.authenticate_as(:'staff_user');
select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001');

-- Archiving the Fish: Ada, Alan and Bea chose it.
select results_eq(
  $$select guest_id::text, household_id::text from public.archive_dish('33333333-0000-0000-0000-000000000001') order by guest_id$$,
  $$values
    ('aaaaaaaa-0000-0000-0000-0000000000a1'::text, 'aaaaaaaa-0000-0000-0000-00000000000a'::text),
    ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a'),
    ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'archive_dish returns the guests and households who must choose again'
);
select tests.clear_auth();
select isnt((select archived_at from public.dishes where id = '33333333-0000-0000-0000-000000000001'), null, 'the dish is archived');
select is((select count(*) from public.meal_selections), 0::bigint, 'the affected selections are removed');
select is(
  (select count(*) from public.meal_selection_history
    where reason = 'dish_archived' and old_dish_id = '33333333-0000-0000-0000-000000000001' and new_dish_id is null),
  3::bigint, 'and kept in the history with the reason dish_archived'
);
select results_eq(
  $$select distinct changed_by from public.meal_selection_history where reason = 'dish_archived'$$,
  format($$values (%L::uuid)$$, :'staff_user'), 'attributed to the staff member'
);

select tests.authenticate_as(:'staff_user');
select is(
  (select count(*) from public.archive_dish('33333333-0000-0000-0000-000000000001')), 0::bigint,
  'archiving again affects nobody'
);
select throws_ok(
  $$select * from public.archive_dish('99999999-0000-0000-0000-000000000009')$$, 'P0001', 'not_found', 'an unknown dish is not_found'
);
select throws_ok(
  $$select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')$$,
  'P0001', 'invalid_meal', 'an archived dish can no longer be chosen'
);
select tests.clear_auth();

-- It drops out of the totals; the other dish stays.
select tests.authenticate_as(:'staff_user');
select results_eq(
  $$select dish_name from public.dish_totals where not not_yet_chosen order by dish_name$$,
  $$values ('Beef'::text)$$, 'the archived dish is gone from the totals'
);
select results_eq(
  $$select chosen_count from public.dish_totals where not_yet_chosen$$,
  $$values (3::bigint)$$, 'and the affected guests show as not yet chosen'
);
select tests.clear_auth();

-- A guest of household A cannot see archived dishes (menu now published).
update public.menus set status = 'published';
select tests.authenticate_as(:'user_a');
select results_eq(
  $$select name from public.dishes$$, $$values ('Beef'::text)$$, 'guests no longer see the archived dish'
);
select tests.clear_auth();
select is(
  (select count(*) from public.audit_log where entity = 'meal_selections' and action = 'delete'), 4::bigint,
  'removing selections (when clearing a choice and when archiving) is audited'
);
select ok(
  not has_function_privilege('anon', 'public.archive_dish(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.staff_set_meal(uuid, uuid, uuid)', 'EXECUTE'),
  'anon cannot execute the staff meal functions'
);

select * from finish();
rollback;
