-- household_rsvp_progress: pending required, pending optional, pending meals.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(17);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'couple', 'Staff');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', null),
  ('cccccccc-0000-0000-0000-00000000000c', 'Household C', 'c@example.test', null),
  ('dddddddd-0000-0000-0000-00000000000d', 'Household D', 'd@example.test', null),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'Household E', 'e@example.test', null);
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta'),
  ('cccccccc-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-00000000000c', 'Cy', 'Gamma'),
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-00000000000e', 'Eve', 'Epsilon');
insert into public.events (id, slug, name, is_required, display_order) values
  ('11111111-0000-0000-0000-00000000000e', 'ceremony', 'Ceremony', true, 1),
  ('22222222-0000-0000-0000-00000000000e', 'welcome', 'Welcome Party', false, 2),
  ('33333333-0000-0000-0000-00000000000e', 'rehearsal', 'Rehearsal', false, 3);

-- A and C: required ceremony + optional welcome party. B: rehearsal only.
-- E: welcome party only, whose menu is still a draft.
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-00000000000e', 'attending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', '11111111-0000-0000-0000-00000000000e', 'declined'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-00000000000e', 'pending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-00000000000e', 'pending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', '33333333-0000-0000-0000-00000000000e', 'pending'),
  ('cccccccc-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-00000000000e', 'pending'),
  ('cccccccc-0000-0000-0000-0000000000c1', '22222222-0000-0000-0000-00000000000e', 'pending'),
  ('eeeeeeee-0000-0000-0000-0000000000e1', '22222222-0000-0000-0000-00000000000e', 'attending');

-- The ceremony menu is published: one course needing a choice, one that does
-- not, and one with no dishes at all. The welcome party menu is a draft.
insert into public.menus (id, event_id, status) values
  ('aaaa0000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000e', 'published'),
  ('aaaa0000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-00000000000e', 'draft');
insert into public.courses (id, menu_id, name, display_order, requires_choice) values
  ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'Main', 1, true),
  ('bbbb0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001', 'Petit fours', 2, false),
  ('bbbb0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000001', 'Empty course', 3, true),
  ('bbbb0000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000002', 'Draft course', 1, true);
insert into public.dishes (id, course_id, name) values
  ('cccc0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'Main Dish'),
  ('cccc0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000002', 'Sweet'),
  ('cccc0000-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-000000000004', 'Draft Dish');

select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.household_rsvp_progress'::regclass), false),
  'household_rsvp_progress is a security_invoker view'
);
select tests.authenticate_anon();
select throws_ok('select * from public.household_rsvp_progress', '42501', null, 'anon cannot read household_rsvp_progress');
select tests.clear_auth();
select tests.authenticate_as(:'user_a');
select is_empty('select * from public.household_rsvp_progress', 'a guest sees no progress rows');
select tests.clear_auth();

select tests.authenticate_as(:'staff_user');
select results_eq(
  $$select display_name, pending_required, pending_optional, pending_meals
      from public.household_rsvp_progress order by display_name$$,
  $$values
    ('Household A'::text, 0::bigint, 2::bigint, 1::bigint),
    ('Household B', 0, 1, 0),
    ('Household C', 1, 1, 0),
    ('Household D', 0, 0, 0),
    ('Household E', 0, 0, 0)$$,
  'required, optional and meal counts are separate'
);
select is(
  (select pending_required from public.household_rsvp_progress where display_name = 'Household A'), 0::bigint,
  'a household that answered every required event has zero pending required even with the welcome party open'
);
select results_eq(
  $$select pending_required, pending_optional from public.household_rsvp_progress where display_name = 'Household B'$$,
  $$values (0::bigint, 1::bigint)$$,
  'a rehearsal-only household has no required events and one open optional event'
);
select is(
  (select count(*) from public.household_rsvp_progress where display_name = 'Household D'), 1::bigint,
  'a household with no invitations still appears, with zeros'
);
select is(
  (select pending_meals from public.household_rsvp_progress where display_name = 'Household E'), 0::bigint,
  'a draft menu creates no pending meals'
);

-- Pending meals count only attending guests, required courses with dishes, on published menus.
select is(
  (select pending_meals from public.household_rsvp_progress where display_name = 'Household A'), 1::bigint,
  'only the attending guest and the required, non-empty course count as a pending meal'
);
insert into public.meal_selections (guest_id, course_id, dish_id)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'bbbb0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001');
select is(
  (select pending_meals from public.household_rsvp_progress where display_name = 'Household A'), 0::bigint,
  'choosing a dish clears the pending meal'
);

-- Answers move the counts straight away.
select public.staff_set_rsvp('cccccccc-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-00000000000e', 'attending');
select results_eq(
  $$select pending_required, pending_meals from public.household_rsvp_progress where display_name = 'Household C'$$,
  $$values (0::bigint, 1::bigint)$$,
  'answering the required event clears it, and attending creates a pending meal'
);
select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-00000000000e', 'attending');
select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-00000000000e', 'declined');
select is(
  (select pending_optional from public.household_rsvp_progress where display_name = 'Household A'), 0::bigint,
  'answering the optional events clears them'
);
update public.menus set status = 'published' where id = 'aaaa0000-0000-0000-0000-000000000002';
select is(
  (select pending_meals from public.household_rsvp_progress where display_name = 'Household A'), 1::bigint,
  'publishing the welcome party menu adds the attending guest''s pending meal'
);
update public.menus set status = 'closed' where id = 'aaaa0000-0000-0000-0000-000000000002';
select is(
  (select pending_meals from public.household_rsvp_progress where display_name = 'Household A'), 0::bigint,
  'a closed menu no longer counts'
);
select tests.clear_auth();

select ok(not has_table_privilege('anon', 'public.household_rsvp_progress', 'SELECT'), 'anon has no privilege on the view');
select ok(has_table_privilege('authenticated', 'public.household_rsvp_progress', 'SELECT'), 'authenticated can select (rows are filtered to staff)');

select * from finish();
rollback;
