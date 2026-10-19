-- Every capability in section 1 of contracts/admin-api.md ("Direct data access
-- under row-level security"): staff can do each, guests and visitors can do
-- none of them, and staff still cannot write the sign-in columns of a household
-- or insert or delete households directly.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(152);

-- Helpers local to this test. `affected` runs one insert/update/delete as the
-- current role and returns how many rows it changed, or -1 if it was refused.
-- `visible` counts the rows a role can read in a table or view, or -1 if refused.
create function tests.affected(q text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  execute 'with x as (' || q || ' returning 1) select count(*) from x' into n;
  return n;
exception when others then
  return -1;
end
$f$;
create function tests.visible(t text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from %s', t) into n;
  return n;
exception when others then
  return -1;
end
$f$;
grant execute on function tests.affected(text), tests.visible(text) to public;

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'), (:'planner_user', 'planner', 'Planner');
update public.settings set default_rsvp_deadline = now() + interval '30 days', rsvp_open = true;

insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'event-two', 'Event Two', false);
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'pending');
update public.invitations set status = 'declined'
  where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b1';  -- leaves rsvp_history
insert into public.dietary_categories (key, label, kind, display_order) values
  ('nuts', 'Nuts', 'allergen', 1), ('vegetarian', 'Vegetarian', 'diet', 2);
insert into public.menus (id, event_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'published');
insert into public.courses (id, menu_id, name, display_order, requires_choice) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Main', 1, true);
insert into public.dishes (id, course_id, name) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Dish One'),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'Dish Two');
insert into public.dish_tags (dish_id, category_key) values ('33333333-0000-0000-0000-000000000001', 'nuts');
insert into public.guest_dietary (guest_id, category_key, severity) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'nuts', 'allergy'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'vegetarian', 'preference');
insert into public.meal_selections (guest_id, course_id, dish_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002');
update public.meal_selections set dish_id = '33333333-0000-0000-0000-000000000001'
  where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';  -- leaves meal_selection_history
insert into public.message_types (key, label, is_essential, template_key) values
  ('invitation', 'Invitation', true, 'invitation');
insert into public.campaigns (id, message_type_key, name, audience, status) values
  ('cccccccc-0000-0000-0000-000000000001', 'invitation', 'Existing', '{"scope":"all"}', 'sending');
insert into public.messages (id, campaign_id, household_id, status) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'sent');
update public.messages set provider_message_id = 'prov-1' where id = 'dddddddd-0000-0000-0000-000000000001';
insert into public.message_events (provider_event_id, message_id, type, occurred_at)
  values ('evt-1', 'dddddddd-0000-0000-0000-000000000001', 'email.sent', now());

-- Reads that only staff may do.
create temp table staff_reads (label text, relation text);
insert into staff_reads values
  ('settings', 'public.settings'), ('staff', 'public.staff'), ('message_types', 'public.message_types'),
  ('campaigns', 'public.campaigns'), ('messages', 'public.messages'), ('message_events', 'public.message_events'),
  ('audit_log', 'public.audit_log'), ('rsvp_history', 'public.rsvp_history'),
  ('meal_selection_history', 'public.meal_selection_history'),
  ('event_counts', 'public.event_counts'), ('dish_totals', 'public.dish_totals'),
  ('dietary_list', 'public.dietary_list'), ('meal_conflicts', 'public.meal_conflicts'),
  ('household_rsvp_progress', 'public.household_rsvp_progress');
-- Reads of household data. Staff see everything; a guest sees only their own household.
create temp table household_reads (label text, relation text, other_household_filter text);
insert into household_reads values
  ('households', 'public.households', 'id = ''bbbbbbbb-0000-0000-0000-00000000000b'''),
  ('guests', 'public.guests', 'household_id = ''bbbbbbbb-0000-0000-0000-00000000000b'''),
  ('invitations', 'public.invitations', 'guest_id = ''bbbbbbbb-0000-0000-0000-0000000000b1'''),
  ('guest_dietary', 'public.guest_dietary', 'guest_id = ''bbbbbbbb-0000-0000-0000-0000000000b1'''),
  ('meal_selections', 'public.meal_selections', 'guest_id = ''bbbbbbbb-0000-0000-0000-0000000000b1''');
-- Writes, in the order they run for staff. Each changes exactly one row for staff.
create temp table writes (n int, label text, stmt text);
insert into writes values
  (1,  'update a guest', $q$update public.guests set notes = 'note' where id = 'aaaaaaaa-0000-0000-0000-0000000000a2'$q$),
  (2,  'insert a guest', $q$insert into public.guests (id, household_id, first_name, last_name) values ('aaaaaaaa-0000-0000-0000-0000000000a9', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Amy', 'Alpha')$q$),
  (3,  'delete a guest', $q$delete from public.guests where id = 'aaaaaaaa-0000-0000-0000-0000000000a9'$q$),
  (4,  'insert an invitation', $q$insert into public.invitations (guest_id, event_id) values ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000002')$q$),
  (5,  'update an invitation', $q$update public.invitations set status = 'attending' where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' and event_id = 'eeeeeeee-0000-0000-0000-000000000002'$q$),
  (6,  'delete an invitation', $q$delete from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' and event_id = 'eeeeeeee-0000-0000-0000-000000000002'$q$),
  (7,  'update household fields', $q$update public.households set display_name = 'Household A edited', notes = 'n', address = '{"street":"1 Example Road"}', plus_one_allowance = 1, rsvp_deadline_override = now() + interval '5 days', reminders_opt_out = true, message_to_couple = 'hi' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$),
  (8,  'insert an event', $q$insert into public.events (id, slug, name, is_required) values ('eeeeeeee-0000-0000-0000-000000000009', 'event-nine', 'Event Nine', false)$q$),
  (9,  'update an event', $q$update public.events set name = 'Renamed' where id = 'eeeeeeee-0000-0000-0000-000000000009'$q$),
  (10, 'insert a menu', $q$insert into public.menus (id, event_id, status) values ('11111111-0000-0000-0000-000000000009', 'eeeeeeee-0000-0000-0000-000000000009', 'draft')$q$),
  (11, 'update a menu', $q$update public.menus set status = 'published' where id = '11111111-0000-0000-0000-000000000009'$q$),
  (12, 'insert a course', $q$insert into public.courses (id, menu_id, name, display_order) values ('22222222-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000009', 'Starter', 1)$q$),
  (13, 'update a course', $q$update public.courses set name = 'Starter renamed' where id = '22222222-0000-0000-0000-000000000009'$q$),
  (14, 'insert a dish', $q$insert into public.dishes (id, course_id, name) values ('33333333-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000009', 'Dish Nine')$q$),
  (15, 'update a dish', $q$update public.dishes set name = 'Dish Nine renamed' where id = '33333333-0000-0000-0000-000000000009'$q$),
  (16, 'insert a dish tag', $q$insert into public.dish_tags (dish_id, category_key) values ('33333333-0000-0000-0000-000000000009', 'vegetarian')$q$),
  (17, 'delete a dish tag', $q$delete from public.dish_tags where dish_id = '33333333-0000-0000-0000-000000000009'$q$),
  (18, 'delete a dish', $q$delete from public.dishes where id = '33333333-0000-0000-0000-000000000009'$q$),
  (19, 'delete a course', $q$delete from public.courses where id = '22222222-0000-0000-0000-000000000009'$q$),
  (20, 'delete a menu', $q$delete from public.menus where id = '11111111-0000-0000-0000-000000000009'$q$),
  (21, 'delete an event', $q$delete from public.events where id = 'eeeeeeee-0000-0000-0000-000000000009'$q$),
  (22, 'insert a dietary category', $q$insert into public.dietary_categories (key, label, kind, display_order) values ('gluten-free', 'Gluten-free', 'diet', 3)$q$),
  (23, 'update a dietary category', $q$update public.dietary_categories set label = 'Gluten free' where key = 'gluten-free'$q$),
  (24, 'delete a dietary category', $q$delete from public.dietary_categories where key = 'gluten-free'$q$),
  (25, 'insert a guest dietary need', $q$insert into public.guest_dietary (guest_id, category_key, severity) values ('aaaaaaaa-0000-0000-0000-0000000000a2', 'vegetarian', 'preference')$q$),
  (26, 'update a guest dietary need', $q$update public.guest_dietary set details = 'strict' where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2'$q$),
  (27, 'delete a guest dietary need', $q$delete from public.guest_dietary where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2'$q$),
  (28, 'update settings', $q$update public.settings set rsvp_open = false, default_rsvp_deadline = now() + interval '60 days'$q$),
  (29, 'create a campaign', $q$insert into public.campaigns (id, message_type_key, name, audience) values ('cccccccc-0000-0000-0000-000000000009', 'invitation', 'New campaign', '{"scope":"all"}')$q$),
  (30, 'edit a campaign', $q$update public.campaigns set name = 'Edited', audience = '{"scope":"filter","filters":{"meals_not_chosen":true}}' where id = 'cccccccc-0000-0000-0000-000000000009'$q$),
  (31, 'schedule a campaign', $q$update public.campaigns set status = 'scheduled', scheduled_for = now() + interval '1 day' where id = 'cccccccc-0000-0000-0000-000000000009'$q$),
  (32, 'cancel a campaign', $q$update public.campaigns set status = 'cancelled' where id = 'cccccccc-0000-0000-0000-000000000009'$q$);
grant select on staff_reads, household_reads, writes to public;

-- RPCs staff may call.
create temp table rpcs (n int, label text, stmt text);
insert into rpcs values
  (1, 'invite', $q$select public.invite(array['aaaaaaaa-0000-0000-0000-0000000000a2']::uuid[], 'eeeeeeee-0000-0000-0000-000000000002')$q$),
  (2, 'staff_set_rsvp', $q$select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending')$q$),
  (3, 'staff_set_meal', $q$select public.staff_set_meal('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002')$q$),
  (4, 'archive_dish', $q$select * from public.archive_dish('33333333-0000-0000-0000-000000000001')$q$),
  (5, 'find_duplicate_households', $q$select * from public.find_duplicate_households()$q$),
  (6, 'resolve_audience', $q$select * from public.resolve_audience('{"scope":"all"}')$q$);
grant select on rpcs to public;

-- Anonymous visitors: nothing works.
select tests.authenticate_anon();
select cmp_ok(tests.visible(relation), '<', 0::bigint, 'anon cannot read ' || label) from staff_reads order by label;
select cmp_ok(tests.visible(relation), '<', 0::bigint, 'anon cannot read ' || label) from household_reads order by label;
select cmp_ok(tests.affected(stmt), '<=', 0::bigint, 'anon cannot ' || label) from writes where n in (1, 2, 4, 7, 8, 22, 28, 29) order by n;
select throws_ok(stmt, '42501', null, 'anon cannot call ' || label) from rpcs order by n;
select tests.clear_auth();

-- A guest: staff-only data is empty, other households are invisible, every write is refused.
select tests.authenticate_as(:'user_a');
select is(tests.visible(relation), 0::bigint, 'a guest sees no rows in ' || label) from staff_reads order by label;
select is(tests.visible(relation || ' where ' || other_household_filter), 0::bigint, 'a guest cannot see another household in ' || label) from household_reads order by label;
select cmp_ok(tests.affected(stmt), '<=', 0::bigint, 'a guest cannot ' || label) from writes order by n;
select throws_ok(stmt, 'P0001', 'forbidden', 'a guest cannot call ' || label) from rpcs order by n;
select tests.clear_auth();

-- Staff (the couple; the planner has the same access, covered by the planner test).
select tests.authenticate_as(:'couple_user');
select cmp_ok(tests.visible(relation), '>', 0::bigint, 'staff can read ' || label) from staff_reads order by label;
select cmp_ok(tests.visible(relation), '>=', 1::bigint, 'staff can read ' || label) from household_reads order by label;
select is(tests.affected(stmt), 1::bigint, 'staff can ' || label) from writes order by n;
select lives_ok(stmt, 'staff can call ' || label) from rpcs order by n;

-- But not the sign-in columns of a household, nor create or delete households directly.
select throws_ok(
  $$update public.households set contact_email = 'changed@example.test' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  '42501', null, 'staff cannot write households.contact_email'
);
select throws_ok(
  format($$update public.households set auth_user_id = %L where id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$, :'couple_user'),
  '42501', null, 'staff cannot write households.auth_user_id'
);
select throws_ok(
  $$insert into public.households (display_name) values ('Direct insert')$$,
  '42501', null, 'staff cannot insert a household directly'
);
select throws_ok(
  $$delete from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$,
  '42501', null, 'staff cannot delete a household directly'
);
select tests.clear_auth();
select is((select count(*) from public.households), 2::bigint, 'both households are still there');

select * from finish();
rollback;
