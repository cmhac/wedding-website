-- meal_selection_history.actor_kind: whether the account that made a change was
-- a couple member, a planner, a guest or the system. Mirrors rsvp_history.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(26);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple Member'),
  (:'planner_user', 'planner', 'Planner');
update public.settings set default_rsvp_deadline = now() + interval '30 days', rsvp_open = true;

insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Amy', 'Alpha');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dinner', 'Dinner', true);
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'eeeeeeee-0000-0000-0000-000000000001', 'attending');
insert into public.menus (id, event_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'published');
insert into public.courses (id, menu_id, name, display_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Main', 1);
insert into public.dishes (id, course_id, name) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Fish'),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'Beef'),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', 'Veg Bake');

-- The column.
select has_column('public', 'meal_selection_history', 'actor_kind', 'meal_selection_history has actor_kind');
select col_type_is('public', 'meal_selection_history', 'actor_kind', 'text', 'actor_kind is text');
select col_is_null('public', 'meal_selection_history', 'actor_kind', 'actor_kind is nullable');
select ok(
  coalesce((
    select pg_get_expr(d.adbin, d.adrelid) ~ 'current_actor_kind\(\)'
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.meal_selection_history'::regclass and a.attname = 'actor_kind'
  ), false),
  'the default calls current_actor_kind()'
);

-- The check constraint (run as the test runner, which is not subject to row-level security).
select throws_ok(
  $$insert into public.meal_selection_history (reason, actor_kind) values ('changed', 'robot')$$,
  '23514', null, 'an unknown actor_kind is refused'
);
select lives_ok($$insert into public.meal_selection_history (reason, actor_kind) values ('changed', 'couple')$$, 'couple is allowed');
select lives_ok($$insert into public.meal_selection_history (reason, actor_kind) values ('changed', 'planner')$$, 'planner is allowed');
select lives_ok($$insert into public.meal_selection_history (reason, actor_kind) values ('changed', 'guest')$$, 'guest is allowed');
select lives_ok($$insert into public.meal_selection_history (reason, actor_kind) values ('changed', 'system')$$, 'system is allowed');
select lives_ok($$insert into public.meal_selection_history (reason, actor_kind) values ('changed', null)$$, 'null is allowed');
delete from public.meal_selection_history;

-- A guest choosing through the guest RPC.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1",
    "meals": [{"course_id": "22222222-0000-0000-0000-000000000001", "dish_id": "33333333-0000-0000-0000-000000000001"}]}]}$json$::jsonb) as ignored \gset
select tests.clear_auth();
select results_eq(
  $$select actor_kind, changed_by from public.meal_selection_history where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' order by id$$,
  format($$values ('guest'::text, %L::uuid)$$, :'user_a'),
  'a guest choosing a dish writes actor_kind guest, and changed_by as before'
);

-- Staff recording a choice: the kind follows the staff role.
select tests.authenticate_as(:'couple_user');
select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001') as ignored \gset
select tests.clear_auth();
select results_eq(
  $$select actor_kind, changed_by from public.meal_selection_history where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' order by id desc limit 1$$,
  format($$values ('couple'::text, %L::uuid)$$, :'couple_user'),
  'staff_set_meal by a couple member writes couple'
);

select tests.authenticate_as(:'planner_user');
select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a3', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001') as ignored \gset
select tests.clear_auth();
select results_eq(
  $$select actor_kind, changed_by from public.meal_selection_history where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a3' order by id desc limit 1$$,
  format($$values ('planner'::text, %L::uuid)$$, :'planner_user'),
  'staff_set_meal by a planner writes planner'
);

-- Clearing a choice (null dish) is attributed the same way.
select tests.authenticate_as(:'planner_user');
select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a3', '22222222-0000-0000-0000-000000000001', null) as ignored \gset
select tests.clear_auth();
select results_eq(
  $$select actor_kind, new_dish_id is null from public.meal_selection_history where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a3' order by id desc limit 1$$,
  $$values ('planner'::text, true)$$,
  'a planner clearing a choice writes planner'
);

select tests.authenticate_as(:'couple_user');
select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-000000000001', null) as ignored \gset
select tests.clear_auth();
select results_eq(
  $$select actor_kind, new_dish_id is null from public.meal_selection_history where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' order by id desc limit 1$$,
  $$values ('couple'::text, true)$$,
  'a couple member clearing a choice writes couple'
);

-- Archiving a dish: Ada (guest) and Alan (couple, again) hold the Fish; a planner archives it.
select tests.authenticate_as(:'couple_user');
select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001') as ignored \gset
select tests.authenticate_as(:'planner_user');
select count(*) as archived from public.archive_dish('33333333-0000-0000-0000-000000000001') \gset
select tests.clear_auth();
select results_eq(
  $$select actor_kind, count(*) from public.meal_selection_history where reason = 'dish_archived' group by actor_kind$$,
  $$values ('planner'::text, 2::bigint)$$,
  'archive_dish writes the staff member''s kind on every history row it creates'
);
select results_eq(
  $$select distinct changed_by from public.meal_selection_history where reason = 'dish_archived'$$,
  format($$values (%L::uuid)$$, :'planner_user'),
  'and changed_by is still the staff member'
);

-- A guest declining the event.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a3", "meals": [{"course_id": "22222222-0000-0000-0000-000000000001", "dish_id": "33333333-0000-0000-0000-000000000002"}]}]}'::jsonb) as ignored \gset
select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a3", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "declined"}]}]}'::jsonb) as ignored \gset
select tests.clear_auth();
select results_eq(
  $$select reason, actor_kind from public.meal_selection_history where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a3' and reason = 'declined'$$,
  $$values ('declined'::text, 'guest'::text)$$,
  'a guest declining writes reason declined with actor_kind guest'
);

-- A change with nobody signed in is the system.
select tests.clear_auth();
insert into public.meal_selections (guest_id, course_id, dish_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003');
select results_eq(
  $$select actor_kind, changed_by is null from public.meal_selection_history where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' order by id desc limit 1$$,
  $$values ('system'::text, true)$$,
  'a change with nobody signed in writes system, with no changed_by'
);

-- Row-level security is unchanged.
select tests.authenticate_as(:'couple_user');
select ok(
  (select count(*) from public.meal_selection_history where actor_kind is not null) > 0,
  'staff can select actor_kind'
);
select throws_ok(
  $$insert into public.meal_selection_history (reason) values ('changed')$$, '42501', null, 'staff cannot insert into the history'
);
select throws_ok(
  $$update public.meal_selection_history set actor_kind = 'guest'$$, '42501', null, 'staff cannot update the history'
);
select throws_ok(
  $$delete from public.meal_selection_history$$, '42501', null, 'staff cannot delete from the history'
);
select tests.clear_auth();
select tests.authenticate_as(:'user_a');
select is((select count(*) from public.meal_selection_history), 0::bigint, 'a guest sees no history rows');
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok(
  $$select actor_kind from public.meal_selection_history$$, '42501', null, 'anon cannot read the history'
);
select tests.clear_auth();

-- Old rows stay empty. Drop the column, write an old-style row, then run the
-- migration's two statements in order: the old row stays null, a new row gets
-- the default (which proves the default is set after the column is added).
delete from public.meal_selection_history;
alter table public.meal_selection_history drop column actor_kind;
insert into public.meal_selection_history (guest_id, reason) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'changed');
alter table public.meal_selection_history add column actor_kind text check (actor_kind in ('couple', 'planner', 'guest', 'system'));
alter table public.meal_selection_history alter column actor_kind set default public.current_actor_kind();
insert into public.meal_selection_history (guest_id, reason) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'declined');
select results_eq(
  $$select actor_kind from public.meal_selection_history order by id$$,
  $$values (null::text), ('system'::text)$$,
  'rows written before the column stay empty, and new rows get the default'
);

select * from finish();
rollback;
