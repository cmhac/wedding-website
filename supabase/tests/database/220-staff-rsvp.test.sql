-- staff_set_rsvp: staff answer on a household's behalf, ignoring deadlines.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(12);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'), (:'planner_user', 'planner', 'Planner');
update public.settings set default_rsvp_deadline = '2000-01-01T00:00:00Z', rsvp_open = false;

insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'event-two', 'Event Two', false);
insert into public.invitations (guest_id, event_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001');

select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending')$$,
  'P0001', 'forbidden', 'a guest cannot use staff_set_rsvp'
);
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok(
  $$select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending')$$,
  '42501', null, 'anon cannot use staff_set_rsvp'
);
select tests.clear_auth();

-- RSVPs are closed and the deadline has passed; staff are not bound.
select tests.authenticate_as(:'couple_user');
select is(
  (public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending')) ->> 'status',
  'attending', 'staff can answer after the deadline and while RSVPs are closed'
);
select tests.clear_auth();
select results_eq(
  $$select responded_by, responded_at is not null from public.invitations
     where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  format($$values (%L::uuid, true)$$, :'couple_user'),
  'the staff member is recorded as responded_by'
);
select results_eq(
  $$select actor_kind, changed_by, old_status::text, new_status::text from public.rsvp_history$$,
  format($$values ('couple'::text, %L::uuid, 'pending'::text, 'attending'::text)$$, :'couple_user'),
  'rsvp_history records the couple as the actor'
);

select tests.authenticate_as(:'planner_user');
select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'declined');
select tests.clear_auth();
select results_eq(
  $$select actor_kind, new_status::text from public.rsvp_history order by id desc limit 1$$,
  $$values ('planner'::text, 'declined'::text)$$,
  'a planner change is recorded as planner'
);
select is(
  (select count(*) from public.audit_log where entity = 'invitations' and action = 'update' and actor_kind in ('couple', 'planner')),
  2::bigint, 'both changes are in the audit log'
);

select tests.authenticate_as(:'couple_user');
select is(
  (public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'pending')) ->> 'status',
  'pending', 'staff can put an answer back to pending'
);
select throws_ok(
  $$select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000002', 'attending')$$,
  'P0001', 'not_found', 'an invitation that does not exist is not_found'
);
select throws_ok(
  $$select public.staff_set_rsvp('99999999-0000-0000-0000-000000000009', 'eeeeeeee-0000-0000-0000-000000000001', 'attending')$$,
  'P0001', 'not_found', 'an unknown guest is not_found'
);
select throws_ok(
  $$select public.staff_set_rsvp('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'maybe')$$,
  '22P02', null, 'a status other than pending, attending or declined is refused'
);
select tests.clear_auth();

select ok(
  not has_function_privilege('anon', 'public.staff_set_rsvp(uuid, uuid, public.rsvp_status)', 'EXECUTE')
    and has_function_privilege('anon', 'public.get_my_rsvp()', 'EXECUTE'),
  'anon cannot execute staff functions but can reach the guest ones (which refuse it)'
);

select * from finish();
rollback;
