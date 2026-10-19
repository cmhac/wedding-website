-- event_counts: invited, attending, declined, pending per event; staff only.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(11);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'couple', 'Staff');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', null);
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bob', 'Beta');
insert into public.events (id, slug, name, is_required, display_order) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true, 1),
  ('eeeeeeee-0000-0000-0000-000000000002', 'event-two', 'Event Two', false, 2),
  ('eeeeeeee-0000-0000-0000-000000000003', 'event-three', 'Event Three', false, 3);

-- Event one: everyone (2 attending, 1 declined, 1 pending).
-- Event two: Ada and Bea (1 attending, 1 pending). Event three: nobody.
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'declined'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'eeeeeeee-0000-0000-0000-000000000001', 'pending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000002', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000002', 'pending');

select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.event_counts'::regclass), false),
  'event_counts is a security_invoker view'
);

select tests.authenticate_anon();
select throws_ok('select * from public.event_counts', '42501', null, 'anon cannot read event_counts');
select tests.clear_auth();

select tests.authenticate_as(:'user_a');
select is_empty('select * from public.event_counts', 'a guest sees no counts');
select tests.clear_auth();

select tests.authenticate_as(:'staff_user');
select results_eq(
  $$select slug, invited, attending, declined, pending from public.event_counts order by slug$$,
  $$values
    ('event-one'::text, 4::bigint, 2::bigint, 1::bigint, 1::bigint),
    ('event-three', 0, 0, 0, 0),
    ('event-two', 2, 1, 0, 1)$$,
  'counts match a hand count, and an event with no invitations shows zeros'
);
select results_eq(
  $$select invited = attending + declined + pending from public.event_counts order by slug$$,
  $$values (true), (true), (true)$$,
  'invited always equals attending plus declined plus pending'
);

-- Counts change immediately when an answer changes.
update public.invitations set status = 'attending'
  where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b2' and event_id = 'eeeeeeee-0000-0000-0000-000000000001';
select results_eq(
  $$select attending, declined, pending from public.event_counts where slug = 'event-one'$$,
  $$values (3::bigint, 1::bigint, 0::bigint)$$,
  'a new answer shows in the counts straight away'
);
update public.invitations set status = 'declined'
  where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001';
select results_eq(
  $$select attending, declined, pending from public.event_counts where slug = 'event-one'$$,
  $$values (2::bigint, 2::bigint, 0::bigint)$$,
  'a changed answer moves between columns'
);
delete from public.invitations
  where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b1' and event_id = 'eeeeeeee-0000-0000-0000-000000000002';
select is(
  (select invited from public.event_counts where slug = 'event-two'), 1::bigint,
  'removing an invitation lowers the invited count'
);
select tests.clear_auth();

select ok(not has_table_privilege('anon', 'public.event_counts', 'SELECT'), 'anon has no privilege on event_counts');
select ok(has_table_privilege('authenticated', 'public.event_counts', 'SELECT'), 'authenticated can select (rows filtered to staff)');

select * from finish();
rollback;
