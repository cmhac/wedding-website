-- Menus, courses, dishes, dish tags, dietary categories: who can read and write.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(36);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'planner', 'Staff');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'published-event', 'Published Event', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'draft-event', 'Draft Event', false),
  ('eeeeeeee-0000-0000-0000-000000000003', 'closed-event', 'Closed Event', false),
  ('eeeeeeee-0000-0000-0000-000000000004', 'unmenued-event', 'No Menu Event', false);
-- A is invited to the published and closed events; B only to the draft one.
insert into public.invitations (guest_id, event_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000003'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000002');

insert into public.dietary_categories (key, label, kind, display_order) values
  ('vegetarian', 'Vegetarian', 'diet', 1), ('nuts', 'Nuts', 'allergen', 2);
insert into public.menus (id, event_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'published'),
  ('11111111-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002', 'draft'),
  ('11111111-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000003', 'closed');
insert into public.courses (id, menu_id, name, display_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Published course', 1),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'Draft course', 1),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'Closed course', 1);
insert into public.dishes (id, course_id, name, archived_at) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Visible dish', null),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'Archived dish', now()),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'Draft dish', null),
  ('33333333-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000003', 'Closed dish', null);
insert into public.dish_tags (dish_id, category_key) values
  ('33333333-0000-0000-0000-000000000001', 'vegetarian'),
  ('33333333-0000-0000-0000-000000000002', 'nuts'),
  ('33333333-0000-0000-0000-000000000003', 'vegetarian');

-- Structure.
select col_is_unique('public', 'menus', 'event_id', 'menus.event_id is unique');
select col_is_unique('public', 'dishes', array['id', 'course_id'], 'dishes (id, course_id) is unique');
select throws_ok(
  $$insert into public.menus (event_id) values ('eeeeeeee-0000-0000-0000-000000000001')$$,
  '23505', null, 'an event has at most one menu'
);
select is(
  (select status::text from public.menus where id = '11111111-0000-0000-0000-000000000001'), 'published', 'menu status is stored'
);
select throws_ok(
  $$insert into public.dish_tags (dish_id, category_key) values ('33333333-0000-0000-0000-000000000001', 'no-such-category')$$,
  '23503', null, 'a dish tag must name a real category'
);

-- Anonymous visitors: nothing.
select tests.authenticate_anon();
select throws_ok('select * from public.menus', '42501', null, 'anon cannot read menus');
select throws_ok('select * from public.courses', '42501', null, 'anon cannot read courses');
select throws_ok('select * from public.dishes', '42501', null, 'anon cannot read dishes');
select throws_ok('select * from public.dish_tags', '42501', null, 'anon cannot read dish tags');
select throws_ok('select * from public.dietary_categories', '42501', null, 'anon cannot read dietary categories');
select tests.clear_auth();

-- Guest A: published and closed menus for invited events, non-archived dishes only.
select tests.authenticate_as(:'user_a');
select results_eq(
  'select status::text from public.menus order by status', $$values ('closed'::text), ('published')$$,
  'guest A sees the published and closed menus of events they are invited to, not the draft'
);
select results_eq(
  'select name from public.courses order by name', $$values ('Closed course'::text), ('Published course')$$,
  'guest A sees only the courses of those menus'
);
select results_eq(
  'select name from public.dishes order by name', $$values ('Closed dish'::text), ('Visible dish')$$,
  'guest A sees no archived dish and no draft dish'
);
select results_eq(
  'select dish_id::text, category_key from public.dish_tags',
  $$values ('33333333-0000-0000-0000-000000000001'::text, 'vegetarian'::text)$$,
  'guest A sees the tags of visible dishes only'
);
select is((select count(*) from public.dietary_categories), 2::bigint, 'guest A can read the dietary categories');

-- Guest A cannot write any of them.
select throws_ok($$insert into public.menus (event_id) values ('eeeeeeee-0000-0000-0000-000000000004')$$, '42501', null, 'guest cannot insert menus');
select is_empty($$with u as (update public.menus set status = 'draft' returning 1) select * from u$$, 'guest cannot update menus');
select is_empty($$with d as (delete from public.menus returning 1) select * from d$$, 'guest cannot delete menus');
select throws_ok($$insert into public.courses (menu_id, name) values ('11111111-0000-0000-0000-000000000001', 'x')$$, '42501', null, 'guest cannot insert courses');
select is_empty($$with u as (update public.courses set name = 'x' returning 1) select * from u$$, 'guest cannot update courses');
select throws_ok($$insert into public.dishes (course_id, name) values ('22222222-0000-0000-0000-000000000001', 'x')$$, '42501', null, 'guest cannot insert dishes');
select is_empty($$with u as (update public.dishes set name = 'x' returning 1) select * from u$$, 'guest cannot update dishes');
select is_empty($$with d as (delete from public.dishes returning 1) select * from d$$, 'guest cannot delete dishes');
select throws_ok($$insert into public.dish_tags (dish_id, category_key) values ('33333333-0000-0000-0000-000000000001', 'nuts')$$, '42501', null, 'guest cannot insert tags');
select is_empty($$with d as (delete from public.dish_tags returning 1) select * from d$$, 'guest cannot delete tags');
select throws_ok($$insert into public.dietary_categories (key, label, kind) values ('x', 'X', 'diet')$$, '42501', null, 'guest cannot insert categories');
select is_empty($$with u as (update public.dietary_categories set label = 'x' returning 1) select * from u$$, 'guest cannot update categories');
select tests.clear_auth();

-- Guest B is invited only to an event whose menu is still a draft.
select tests.authenticate_as(:'user_b');
select is((select count(*) from public.menus), 0::bigint, 'guest B sees no menus (the only one is a draft)');
select is((select count(*) from public.dishes), 0::bigint, 'guest B sees no dishes');
select tests.clear_auth();

-- Staff see and change everything, drafts included.
select tests.authenticate_as(:'staff_user');
select is((select count(*) from public.menus), 3::bigint, 'staff see every menu, drafts included');
select is((select count(*) from public.dishes), 4::bigint, 'staff see archived dishes too');
select lives_ok(
  $$insert into public.menus (event_id, status) values ('eeeeeeee-0000-0000-0000-000000000004', 'draft')$$, 'staff can create a menu'
);
select lives_ok(
  $$update public.courses set requires_choice = false where id = '22222222-0000-0000-0000-000000000002'$$, 'staff can edit a course'
);
select lives_ok(
  $$insert into public.dietary_categories (key, label, kind, display_order) values ('sesame', 'Sesame', 'allergen', 3)$$,
  'staff can add a dietary category'
);
select lives_ok(
  $$insert into public.dish_tags (dish_id, category_key) values ('33333333-0000-0000-0000-000000000004', 'sesame')$$, 'staff can tag a dish'
);
select lives_ok(
  $$delete from public.dish_tags where dish_id = '33333333-0000-0000-0000-000000000004'$$, 'staff can remove a tag'
);
select tests.clear_auth();

select * from finish();
rollback;
