-- invite(guest_ids, event_id): add invitations, touch nothing else, staff only.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(16);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'planner', 'Staff');
insert into public.households (id, display_name, contact_email, auth_user_id)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'event-two', 'Event Two', false);
-- Ada already answered event one; Alan is already invited to event two.
insert into public.invitations (guest_id, event_id, status, responded_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending', now()),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000002', 'declined', now());

-- Not staff.
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.invite(array['aaaaaaaa-0000-0000-0000-0000000000a1']::uuid[], 'eeeeeeee-0000-0000-0000-000000000002')$$,
  'P0001', 'forbidden', 'a guest cannot invite'
);
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok(
  $$select public.invite(array['aaaaaaaa-0000-0000-0000-0000000000a1']::uuid[], 'eeeeeeee-0000-0000-0000-000000000002')$$,
  '42501', null, 'anon cannot invite'
);
select tests.clear_auth();

select is((select count(*) from public.invitations), 2::bigint, 'refused calls added nothing');

-- Staff: invite both guests to event two (Alan already is) and Ada again to event one.
select tests.authenticate_as(:'staff_user');
select is(
  (public.invite(
    array['aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a2']::uuid[],
    'eeeeeeee-0000-0000-0000-000000000002')) ->> 'added',
  '1', 'one new invitation is added'
);
select is(
  (public.invite(
    array['aaaaaaaa-0000-0000-0000-0000000000a1']::uuid[], 'eeeeeeee-0000-0000-0000-000000000001')) ->> 'added',
  '0', 're-inviting adds nothing'
);
select results_eq(
  $$select (public.invite(
      array['aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a2', '99999999-0000-0000-0000-000000000009']::uuid[],
      'eeeeeeee-0000-0000-0000-000000000002')) ->> 'existing',
    (public.invite(array[]::uuid[], 'eeeeeeee-0000-0000-0000-000000000002')) ->> 'added'$$,
  $$values ('2'::text, '0'::text)$$,
  'already-invited guests are counted, not duplicated'
);
select is(
  (public.invite(array['99999999-0000-0000-0000-000000000009']::uuid[], 'eeeeeeee-0000-0000-0000-000000000002')) ->> 'unknown',
  '1', 'unknown guest ids are reported, not invited'
);
select throws_ok(
  $$select public.invite(array['aaaaaaaa-0000-0000-0000-0000000000a1']::uuid[], '99999999-0000-0000-0000-000000000009')$$,
  'P0001', 'not_found', 'an unknown event is refused'
);
select tests.clear_auth();

select is((select count(*) from public.invitations), 3::bigint, 'exactly one invitation was added overall');
select is(
  (select status::text from public.invitations
    where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'attending', 'existing invitations are untouched'
);
select is(
  (select status::text from public.invitations
    where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' and event_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'declined', 'an existing answer is not reset'
);
select is(
  (select status::text from public.invitations
    where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'pending', 'a new invitation starts pending'
);
select is(
  (select invited_by from public.invitations
    where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  :'staff_user'::uuid, 'the invitation records who invited'
);
select results_eq(
  $$select actor_kind, action from public.audit_log
     where entity = 'invitations' and entity_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and actor_user_id is not null$$,
  $$values ('planner'::text, 'insert'::text)$$,
  'the invitation is audited against the planner'
);
-- No send of any kind happens: there is no messaging table yet, and no change to households.
select is(
  (select count(*) from public.audit_log where entity = 'households' and actor_user_id is not null),
  0::bigint, 'inviting changes nothing else'
);
select throws_ok(
  $$select public.invite(null, 'eeeeeeee-0000-0000-0000-000000000002')$$,
  'P0001', 'invalid_payload', 'a null guest list is refused'
);

select * from finish();
rollback;
