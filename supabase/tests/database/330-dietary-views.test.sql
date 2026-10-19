-- meal_conflicts, dish_totals, dietary_list.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(21);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'couple', 'Staff');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', null);
insert into public.guests (id, household_id, first_name, last_name, dietary_notes) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Vera', 'Veg', 'no mushrooms'),   -- vegetarian, picks plain: conflict
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Vic', 'Veggie', null),          -- vegetarian, picks veg: fine
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Nell', 'Nuts', null),           -- nut allergy, picks nutty: conflict
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Nigel', 'Nutfree', null),       -- nut allergy, picks plain: fine
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Dora', 'Declined', null),       -- declined, has a restriction
  ('bbbbbbbb-0000-0000-0000-0000000000b4', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Una', 'Undecided', 'loves cake'), -- attending, no choice, note only
  ('bbbbbbbb-0000-0000-0000-0000000000b5', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Pat', 'Plain', null);           -- attending, no restrictions, plain
insert into public.events (id, slug, name, is_required, display_order) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dinner', 'Dinner', true, 1),
  ('eeeeeeee-0000-0000-0000-000000000002', 'brunch', 'Brunch', false, 2);
insert into public.invitations (guest_id, event_id, status)
select g.id, 'eeeeeeee-0000-0000-0000-000000000001',
       case when g.first_name = 'Dora' then 'declined'::public.rsvp_status else 'attending'::public.rsvp_status end
  from public.guests g;
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000002', 'attending');

insert into public.dietary_categories (key, label, kind, display_order) values
  ('vegetarian', 'Vegetarian', 'diet', 1), ('nuts', 'Nuts', 'allergen', 2);
insert into public.menus (id, event_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'published'),
  ('11111111-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002', 'draft');
insert into public.courses (id, menu_id, name, display_order, requires_choice) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Starter', 1, true),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Main', 2, true),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Petit fours', 3, false),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002', 'Brunch main', 1, true);
insert into public.dishes (id, course_id, name, archived_at) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Plain Dish', null),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Veg Dish', null),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'Nutty Dish', null),
  ('33333333-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 'Unchosen Dish', null),
  ('33333333-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 'Archived Dish', now()),
  ('33333333-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000001', 'Starter Dish', null),
  ('33333333-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000004', 'Brunch Dish', null);
insert into public.dish_tags (dish_id, category_key) values
  ('33333333-0000-0000-0000-000000000002', 'vegetarian'),
  ('33333333-0000-0000-0000-000000000003', 'nuts');
insert into public.guest_dietary (guest_id, category_key, severity, details) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'vegetarian', 'preference', null),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'vegetarian', 'allergy', 'strict'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'nuts', 'allergy', 'carries a pen'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'nuts', 'allergy', null),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'vegetarian', 'preference', null);

-- Choices (made as the test runner, so they follow the same selection rules).
insert into public.meal_selections (guest_id, course_id, dish_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000b5', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000007');

select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.meal_conflicts'::regclass), false)
  and coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.dish_totals'::regclass), false)
  and coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.dietary_list'::regclass), false),
  'the three reporting views are security_invoker'
);

select tests.authenticate_anon();
select throws_ok('select * from public.meal_conflicts', '42501', null, 'anon cannot read meal_conflicts');
select throws_ok('select * from public.dish_totals', '42501', null, 'anon cannot read dish_totals');
select throws_ok('select * from public.dietary_list', '42501', null, 'anon cannot read dietary_list');
select tests.clear_auth();
select tests.authenticate_as(:'user_a');
select is_empty('select * from public.meal_conflicts', 'a guest sees no conflicts');
select is_empty('select * from public.dish_totals', 'a guest sees no totals');
select is_empty('select * from public.dietary_list', 'a guest sees no dietary list');
select tests.clear_auth();

select tests.authenticate_as(:'staff_user');

-- A diet category conflicts when the dish lacks the tag; an allergen when it has it.
select results_eq(
  $$select event_slug, course_name, first_name, dish_name, category_key, kind::text, severity
      from public.meal_conflicts order by first_name, event_slug desc$$,
  $$values
    ('dinner'::text, 'Main'::text, 'Nell'::text, 'Nutty Dish'::text, 'nuts'::text, 'allergen'::text, 'allergy'::text),
    ('dinner', 'Main', 'Vera', 'Plain Dish', 'vegetarian', 'diet', 'preference'),
    ('brunch', 'Brunch main', 'Vera', 'Brunch Dish', 'vegetarian', 'diet', 'preference')$$,
  'conflicts: diet without the tag, allergen with the tag; compatible choices are not flagged'
);

-- Totals: attending guests only; zero-count dishes shown; archived dishes not.
select results_eq(
  $$select course_name, dish_name, chosen_count from public.dish_totals
     where not not_yet_chosen and event_slug = 'dinner' order by course_name, dish_name$$,
  $$values
    ('Main'::text, 'Nutty Dish'::text, 1::bigint),
    ('Main', 'Plain Dish', 3),
    ('Main', 'Unchosen Dish', 0),
    ('Main', 'Veg Dish', 1),
    ('Starter', 'Starter Dish', 0)$$,
  'per-dish totals count the guests who chose each dish, show unchosen dishes with zero, and leave out archived dishes'
);
select results_eq(
  $$select course_name, chosen_count from public.dish_totals
     where not_yet_chosen and event_slug = 'dinner' order by course_name$$,
  $$values ('Main'::text, 1::bigint), ('Starter', 6::bigint)$$,
  '"not yet chosen" counts attending guests with no choice, for courses that require one (the declined guest is excluded)'
);
select is(
  (select count(*) from public.dish_totals where course_name = 'Petit fours'), 0::bigint,
  'a course with no dishes and no required choice shows nothing'
);
select results_eq(
  $$select dish_name is null, chosen_count from public.dish_totals where not_yet_chosen and course_name = 'Main'$$,
  $$values (true, 1::bigint)$$,
  'the "not yet chosen" row has no dish'
);

-- The dietary list: attending guests with a restriction or a free-text note.
select results_eq(
  $$select first_name, category_key, severity, details, dietary_notes from public.dietary_list
     where event_slug = 'dinner' order by first_name, category_key$$,
  $$values
    ('Nell'::text, 'nuts'::text, 'allergy'::text, 'carries a pen'::text, null::text),
    ('Nigel', 'nuts', 'allergy', null, null),
    ('Una', null, null, null, 'loves cake'),
    ('Vera', 'vegetarian', 'preference', null, 'no mushrooms'),
    ('Vic', 'vegetarian', 'allergy', 'strict', null)$$,
  'the dietary list has severity, details and notes, and omits guests with nothing to report'
);
select is(
  (select count(*) from public.dietary_list where first_name = 'Dora'), 0::bigint,
  'a declining guest is not on the dietary list'
);
select results_eq(
  $$select household_name, last_name from public.dietary_list where first_name = 'Nell'$$,
  $$values ('Household B'::text, 'Nuts'::text)$$,
  'rows carry the household and guest names for the caterer'
);
select is(
  (select count(*) from public.dietary_list where event_slug = 'brunch'), 1::bigint,
  'the list is per event'
);

-- Display columns, so a report needs no joins.
select results_eq(
  $$select distinct event_name from public.dish_totals where event_slug = 'dinner'$$,
  $$values ('Dinner'::text)$$,
  'dish_totals carries the event name'
);
select results_eq(
  $$select event_name, guest_name, household_name from public.dietary_list where first_name = 'Nell'$$,
  $$values ('Dinner'::text, 'Nell Nuts'::text, 'Household B'::text)$$,
  'dietary_list carries the event name, the guest''s full name and the household name'
);
select results_eq(
  $$select event_name, guest_name, household_name from public.meal_conflicts where first_name = 'Nell'$$,
  $$values ('Dinner'::text, 'Nell Nuts'::text, 'Household B'::text)$$,
  'meal_conflicts carries the event name, the guest''s full name and the household name'
);

-- Declining removes a guest from totals and the list straight away.
select public.staff_set_rsvp('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'declined');
select is(
  (select chosen_count from public.dish_totals where dish_name = 'Nutty Dish'), 0::bigint,
  'a guest who declines drops out of the totals'
);
select is(
  (select count(*) from public.meal_conflicts where first_name = 'Nell'), 0::bigint,
  'and out of the conflicts'
);
select tests.clear_auth();

select * from finish();
rollback;
