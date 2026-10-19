-- Staff, settings, the role helpers, and the "never lock out the couple" rule.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(32);

-- Fixed ids so the assertions below can name people.
select tests.create_user('chris@example.test') as chris \gset
select tests.create_user('hannah@example.test') as hannah \gset
select tests.create_user('planner@example.test') as planner \gset
select tests.create_user('guest@example.test') as guest \gset
select tests.create_user('newstaff@example.test') as newstaff \gset

-- Enums from the extensions-and-enums migration.
select enum_has_labels('public', 'staff_role', array['couple', 'planner'], 'staff_role labels');
select enum_has_labels('public', 'rsvp_status', array['pending', 'attending', 'declined'], 'rsvp_status labels');
select enum_has_labels('public', 'menu_status', array['draft', 'published', 'closed'], 'menu_status labels');
select enum_has_labels(
  'public', 'campaign_status',
  array['draft', 'scheduled', 'sending', 'done', 'cancelled'], 'campaign_status labels'
);
select enum_has_labels(
  'public', 'message_status',
  array['queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped'],
  'message_status labels'
);
select enum_has_labels('public', 'dietary_kind', array['diet', 'allergen'], 'dietary_kind labels');

-- Set-up as the test runner (bypasses row-level security).
insert into public.staff (user_id, role, display_name) values
  (:'chris', 'couple', 'Chris'),
  (:'hannah', 'couple', 'Hannah'),
  (:'planner', 'planner', 'Planner');

-- Anonymous visitors: no access at all.
select tests.authenticate_anon();
select throws_ok('select * from public.staff', '42501', null, 'anon cannot select staff');
select throws_ok('select * from public.settings', '42501', null, 'anon cannot select settings');
select is(public.is_staff(), false, 'is_staff is false for anon');
select is(public.is_couple(), false, 'is_couple is false for anon');
select tests.clear_auth();

-- A signed-in guest who is not staff.
select tests.authenticate_as(:'guest');
select is((select count(*) from public.staff), 0::bigint, 'non-staff user sees no staff rows');
select is((select count(*) from public.settings), 0::bigint, 'non-staff user sees no settings row');
select is(public.is_staff(), false, 'is_staff is false for a non-staff user');
select is(public.is_couple(), false, 'is_couple is false for a non-staff user');
select tests.clear_auth();

-- Planner: reads both, writes settings, cannot touch staff.
select tests.authenticate_as(:'planner');
select is((select count(*) from public.staff), 3::bigint, 'planner can select staff');
select is((select count(*) from public.settings), 1::bigint, 'planner can select settings');
select is(public.is_staff(), true, 'is_staff is true for a planner');
select is(public.is_couple(), false, 'is_couple is false for a planner');
select throws_ok(
  format($$insert into public.staff (user_id, role, display_name) values (%L, 'planner', 'X')$$, :'newstaff'),
  '42501', null, 'planner cannot insert staff'
);
select is_empty(
  $$with u as (update public.staff set display_name = 'Changed' returning 1) select * from u$$,
  'planner cannot update staff'
);
select is_empty(
  $$with d as (delete from public.staff where role = 'planner' returning 1) select * from d$$,
  'planner cannot delete staff'
);
select isnt_empty(
  $$with u as (update public.settings set couple_names = 'Chris and Hannah' returning 1) select * from u$$,
  'planner can update settings'
);
select tests.clear_auth();
select is((select count(*) from public.staff where display_name = 'Changed'), 0::bigint, 'staff rows unchanged by planner');

-- Couple: full control of staff rows.
select tests.authenticate_as(:'chris');
select is(public.is_couple(), true, 'is_couple is true for a couple user');
select lives_ok(
  format($$insert into public.staff (user_id, role, display_name) values (%L, 'planner', 'Helper')$$, :'newstaff'),
  'couple can insert staff'
);
select lives_ok(
  format($$update public.staff set display_name = 'Helper Two' where user_id = %L$$, :'newstaff'),
  'couple can update staff'
);
select lives_ok(
  format($$delete from public.staff where user_id = %L$$, :'newstaff'),
  'couple can delete staff'
);
select tests.clear_auth();

-- The last couple row cannot be removed or demoted; one of two can.
select lives_ok(
  format($$delete from public.staff where user_id = %L$$, :'hannah'),
  'one of two couple rows can be deleted'
);
select throws_ok(
  format($$delete from public.staff where user_id = %L$$, :'chris'),
  'P0001', 'cannot remove or demote the last couple account', 'deleting the last couple row is refused'
);
select throws_ok(
  format($$update public.staff set role = 'planner' where user_id = %L$$, :'chris'),
  'P0001', 'cannot remove or demote the last couple account', 'demoting the last couple row is refused'
);

-- Settings holds exactly one row.
select throws_ok(
  $$insert into public.settings (id) values (true)$$, '23505', null, 'a second settings row is refused'
);
select throws_ok(
  $$insert into public.settings (id) values (false)$$, '23514', null, 'settings id must be true'
);

select * from finish();
rollback;
