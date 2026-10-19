-- Row-level security on guest_dietary, meal_selections, meal_selection_history.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(25);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'couple', 'Staff');
update public.settings set default_rsvp_deadline = now() + interval '30 days';
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dinner', 'Dinner', true);
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending');
insert into public.dietary_categories (key, label, kind, display_order) values
  ('vegetarian', 'Vegetarian', 'diet', 1), ('nuts', 'Nuts', 'allergen', 2);
insert into public.menus (id, event_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'published');
insert into public.courses (id, menu_id, name, display_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Main', 1);
insert into public.dishes (id, course_id, name) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Dish One'),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'Dish Two');
insert into public.guest_dietary (guest_id, category_key, severity, details) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'nuts', 'allergy', 'A detail'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'vegetarian', 'preference', null);
insert into public.meal_selections (guest_id, course_id, dish_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002');
-- Change A's choice so there is history to hide.
update public.meal_selections set dish_id = '33333333-0000-0000-0000-000000000002'
 where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

select tests.authenticate_anon();
select throws_ok('select * from public.guest_dietary', '42501', null, 'anon cannot read guest_dietary');
select throws_ok('select * from public.meal_selections', '42501', null, 'anon cannot read meal_selections');
select throws_ok('select * from public.meal_selection_history', '42501', null, 'anon cannot read meal_selection_history');
select tests.clear_auth();

select tests.authenticate_as(:'user_a');
select results_eq(
  'select guest_id::text, category_key from public.guest_dietary',
  $$values ('aaaaaaaa-0000-0000-0000-0000000000a1'::text, 'nuts'::text)$$,
  'guest A reads only household A dietary rows'
);
select results_eq(
  'select guest_id::text, dish_id::text from public.meal_selections',
  $$values ('aaaaaaaa-0000-0000-0000-0000000000a1'::text, '33333333-0000-0000-0000-000000000002'::text)$$,
  'guest A reads only household A meal selections'
);
select is_empty('select * from public.meal_selection_history', 'guests see no meal selection history');

select throws_ok(
  $$insert into public.guest_dietary (guest_id, category_key, severity) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'vegetarian', 'preference')$$,
  '42501', null, 'guest A cannot insert dietary rows'
);
select is_empty($$with u as (update public.guest_dietary set severity = 'preference' returning 1) select * from u$$, 'guest A cannot update dietary rows');
select is_empty($$with d as (delete from public.guest_dietary returning 1) select * from d$$, 'guest A cannot delete dietary rows');
select throws_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')$$,
  '42501', null, 'guest A cannot insert selections directly'
);
select is_empty($$with u as (update public.meal_selections set dish_id = '33333333-0000-0000-0000-000000000001' returning 1) select * from u$$, 'guest A cannot update selections');
select is_empty($$with d as (delete from public.meal_selections returning 1) select * from d$$, 'guest A cannot delete selections');

-- Household B's rows are out of reach, including through the RPCs.
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "bbbbbbbb-0000-0000-0000-0000000000b1", "dietary": [], "meals": [{"course_id": "22222222-0000-0000-0000-000000000001", "dish_id": "33333333-0000-0000-0000-000000000001"}]}]}'::jsonb)$$,
  'P0001', 'forbidden', 'guest A cannot write household B dietary or meals through submit_household_rsvp'
);
select ok(
  position('Bea' in public.get_my_rsvp()::text) = 0 and position('vegetarian' in (public.get_my_rsvp() -> 'guests' -> 0 ->> 'dietary')) = 0,
  'get_my_rsvp shows nothing of household B'
);
select tests.clear_auth();

select tests.authenticate_as(:'user_b');
select results_eq(
  'select category_key from public.guest_dietary', $$values ('vegetarian'::text)$$, 'guest B reads only household B dietary rows'
);
select results_eq(
  'select guest_id::text from public.meal_selections', $$values ('bbbbbbbb-0000-0000-0000-0000000000b1'::text)$$,
  'guest B reads only household B selections'
);
select tests.clear_auth();

-- Staff.
select tests.authenticate_as(:'staff_user');
select is((select count(*) from public.guest_dietary), 2::bigint, 'staff read all dietary rows');
select is((select count(*) from public.meal_selections), 2::bigint, 'staff read all selections');
select ok((select count(*) from public.meal_selection_history) >= 3, 'staff read the history (two first choices and the change)');
select lives_ok(
  $$insert into public.guest_dietary (guest_id, category_key, severity) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'vegetarian', 'preference')$$,
  'staff can write dietary rows'
);
select lives_ok(
  $$update public.meal_selections set dish_id = '33333333-0000-0000-0000-000000000001' where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b1'$$,
  'staff can write selections'
);
select lives_ok(
  $$delete from public.guest_dietary where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and category_key = 'vegetarian'$$,
  'staff can delete dietary rows'
);
select throws_ok(
  $$insert into public.meal_selection_history (reason) values ('changed')$$, '42501', null,
  'nobody writes the history directly; it is written by the database'
);
select throws_ok(
  $$delete from public.meal_selection_history$$, '42501', null, 'nobody deletes history rows'
);
select tests.clear_auth();

select ok(
  not has_table_privilege('anon', 'public.guest_dietary', 'SELECT')
    and not has_table_privilege('anon', 'public.meal_selections', 'SELECT')
    and not has_table_privilege('anon', 'public.meal_selection_history', 'SELECT'),
  'anon holds no privileges on these tables'
);

select * from finish();
rollback;
