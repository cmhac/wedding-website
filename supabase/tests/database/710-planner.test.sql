-- The planner has the couple's access to everything except the staff table,
-- every change is attributed to the planner, and revoking access is immediate.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(64);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'), (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'event-two', 'Event Two', false);
insert into public.invitations (guest_id, event_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001');
insert into public.message_types (key, label, is_essential, template_key) values
  ('invitation', 'Invitation', true, 'invitation');
insert into public.dietary_categories (key, label, kind, display_order) values
  ('nuts', 'Nuts', 'allergen', 1);

select tests.authenticate_as(:'planner_user');

-- Reads every table.
select lives_ok(format('select count(*) from public.%I', t), 'the planner reads ' || t)
from unnest(array[
  'households', 'guests', 'events', 'invitations', 'settings', 'menus', 'courses', 'dishes',
  'dish_tags', 'dietary_categories', 'guest_dietary', 'meal_selections', 'meal_selection_history',
  'audit_log', 'rsvp_history', 'message_types', 'campaigns', 'messages', 'message_events', 'staff'
]) as t;
select is((select count(*) from public.households), 1::bigint, 'the planner sees household rows');
select is((select count(*) from public.staff), 2::bigint, 'the planner can read the staff list');

-- Writes what the couple can write.
select lives_ok($$insert into public.events (id, slug, name, is_required) values ('eeeeeeee-0000-0000-0000-000000000003', 'event-three', 'Event Three', false)$$, 'the planner creates an event');
select lives_ok($$update public.events set name = 'Event One renamed' where id = 'eeeeeeee-0000-0000-0000-000000000001'$$, 'the planner edits an event');
select lives_ok($$insert into public.invitations (guest_id, event_id) values ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001')$$, 'the planner invites a guest');
select lives_ok($$insert into public.guests (id, household_id, first_name, last_name) values ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Amy', 'Alpha')$$, 'the planner adds a guest');
select lives_ok($$update public.households set notes = 'planner note', display_name = 'Household A edited' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, 'the planner edits household details');
select lives_ok($$update public.settings set rsvp_open = true$$, 'the planner updates settings');
select lives_ok($$insert into public.menus (id, event_id, status) values ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'draft')$$, 'the planner creates a menu');
select lives_ok($$insert into public.courses (id, menu_id, name, display_order) values ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Main', 1)$$, 'the planner adds a course');
select lives_ok($$insert into public.dishes (id, course_id, name) values ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Dish One')$$, 'the planner adds a dish');
select lives_ok($$insert into public.dish_tags (dish_id, category_key) values ('33333333-0000-0000-0000-000000000001', 'nuts')$$, 'the planner tags a dish');
select lives_ok($$insert into public.dietary_categories (key, label, kind, display_order) values ('gluten-free', 'Gluten-free', 'diet', 2)$$, 'the planner adds a dietary category');
select lives_ok($$insert into public.guest_dietary (guest_id, category_key, severity) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'nuts', 'allergy')$$, 'the planner records a dietary need');
select lives_ok($$insert into public.campaigns (id, message_type_key, name, audience) values ('cccccccc-0000-0000-0000-000000000001', 'invitation', 'Planner campaign', '{"scope":"all"}')$$, 'the planner creates a campaign');
select lives_ok($$select * from public.resolve_audience('{"scope":"all"}')$$, 'the planner previews an audience');
select lives_ok($$select public.invite(array['aaaaaaaa-0000-0000-0000-0000000000a3']::uuid[], 'eeeeeeee-0000-0000-0000-000000000002')$$, 'the planner uses invite');
select lives_ok($$select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending')$$, 'the planner answers an RSVP on a household''s behalf');
select lives_ok($$delete from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2'$$, 'the planner removes an invitation');
select lives_ok($$delete from public.guests where id = 'aaaaaaaa-0000-0000-0000-0000000000a3'$$, 'the planner removes a guest');

-- Not the staff table.
select throws_ok(
  format($$insert into public.staff (user_id, role, display_name) values (%L, 'couple', 'Sneaky')$$, :'user_a'),
  '42501', null, 'the planner cannot add a staff row'
);
select is_empty(
  $$with u as (update public.staff set role = 'planner' where role = 'couple' returning 1) select * from u$$,
  'the planner cannot demote a couple member'
);
select is_empty(
  $$with u as (update public.staff set display_name = 'Renamed' returning 1) select * from u$$,
  'the planner cannot edit any staff row'
);
select is_empty(
  $$with d as (delete from public.staff returning 1) select * from d$$,
  'the planner cannot delete staff rows'
);
select tests.clear_auth();
select is(
  (select array_agg(role::text order by role) from public.staff), array['couple', 'planner'],
  'the staff table is unchanged'
);

-- The last couple member cannot be removed, even by the couple.
select tests.authenticate_as(:'couple_user');
select throws_ok(
  format($$delete from public.staff where user_id = %L$$, :'couple_user'),
  'P0001', null, 'the last couple member cannot be removed'
);
select throws_ok(
  format($$update public.staff set role = 'planner' where user_id = %L$$, :'couple_user'),
  'P0001', null, 'the last couple member cannot be demoted'
);
select tests.clear_auth();

-- Attribution.
select is(
  (select count(*) from public.audit_log where entity = 'events' and action = 'update' and actor_kind = 'planner' and actor_user_id = :'planner_user'),
  1::bigint, 'the planner''s event edit is audited as the planner'
);
select is(
  (select count(*) from public.audit_log where entity = 'guests' and action = 'insert' and actor_kind = 'planner'),
  1::bigint, 'the planner''s guest insert is audited as the planner'
);
select is(
  (select count(*) from public.audit_log where entity = 'campaigns' and action = 'insert' and actor_kind = 'planner'),
  1::bigint, 'the planner''s campaign is audited as the planner'
);
select is(
  (select count(*) from public.audit_log where actor_kind = 'planner' and actor_user_id is distinct from :'planner_user'),
  0::bigint, 'every planner audit row names the planner'
);
select results_eq(
  $$select actor_kind, changed_by from public.rsvp_history where new_status = 'attending'$$,
  format($$values ('planner'::text, %L::uuid)$$, :'planner_user'),
  'the RSVP history names the planner'
);
select is(
  (select responded_by from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  :'planner_user'::uuid, 'responded_by names the planner'
);

-- Revoking: the couple delete the planner's staff row, and the planner's next
-- request has no staff access at all.
select tests.authenticate_as(:'couple_user');
select lives_ok(format($$delete from public.staff where user_id = %L$$, :'planner_user'), 'the couple revoke the planner');
select tests.clear_auth();

select tests.authenticate_as(:'planner_user');
select is((select count(*) from public.households), 0::bigint, 'the revoked planner reads no households');
select is((select count(*) from public.guests), 0::bigint, 'the revoked planner reads no guests');
select is((select count(*) from public.campaigns), 0::bigint, 'the revoked planner reads no campaigns');
select is((select count(*) from public.audit_log), 0::bigint, 'the revoked planner reads no audit log');
select is((select count(*) from public.staff), 0::bigint, 'the revoked planner reads no staff list');
select throws_ok(
  $$insert into public.events (slug, name, is_required) values ('late', 'Late', false)$$,
  '42501', null, 'the revoked planner cannot write'
);
select throws_ok($$select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'declined')$$, 'P0001', 'forbidden', 'staff_set_rsvp raises forbidden');
select throws_ok($$select * from public.resolve_audience('{"scope":"all"}')$$, 'P0001', 'forbidden', 'resolve_audience raises forbidden');
select throws_ok($$select public.invite(array['aaaaaaaa-0000-0000-0000-0000000000a1']::uuid[], 'eeeeeeee-0000-0000-0000-000000000002')$$, 'P0001', 'forbidden', 'invite raises forbidden');
select is((select count(*) from public.event_counts), 0::bigint, 'the revoked planner sees no event counts');
select tests.clear_auth();

select * from finish();
rollback;
