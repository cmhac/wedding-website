-- Audit log (who changed what, column names only) and RSVP history.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(32);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household@example.test') as guest_user \gset

-- Set-up as the test runner: these writes are "system" changes.
insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'),
  (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, contact_email, auth_user_id)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'guest_user');
insert into public.guests (id, household_id, first_name, last_name)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha');
insert into public.events (id, slug, name, is_required)
  values ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true);
insert into public.invitations (guest_id, event_id)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001');

-- System changes are recorded with no actor.
select results_eq(
  $$select actor_user_id is null, actor_kind, action from public.audit_log
    where entity = 'households' and entity_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  $$values (true, 'system'::text, 'insert'::text)$$,
  'a system insert is audited with actor kind system'
);
select is(
  (select count(*) from public.audit_log where entity = 'staff' and action = 'insert'),
  2::bigint, 'staff inserts are audited'
);
select is(
  (select count(*) from public.rsvp_history), 0::bigint,
  'creating an invitation (still pending) writes no RSVP history'
);

-- The couple changes a guest.
select tests.authenticate_as(:'couple_user');
update public.guests set first_name = 'Newname' where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select tests.clear_auth();
select results_eq(
  $$select actor_user_id, actor_kind, entity, action, changed_fields from public.audit_log
    where entity = 'guests' and action = 'update'$$,
  format($$values (%L::uuid, 'couple'::text, 'guests'::text, 'update'::text, array['first_name']::text[])$$, :'couple_user'),
  'a guest change by the couple is audited with column names only'
);
select ok(
  not exists (
    select 1 from public.audit_log
    where array_to_string(changed_fields, ',') ilike '%Newname%'
       or array_to_string(changed_fields, ',') ilike '%Ada%'
  ),
  'changed_fields never holds values'
);
select is(
  (select entity_id from public.audit_log where entity = 'guests' and action = 'update'),
  'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid, 'the audit row names the guest id'
);

-- The planner changes a household.
select tests.authenticate_as(:'planner_user');
update public.households set notes = 'secret note' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.clear_auth();
select results_eq(
  $$select actor_kind, changed_fields from public.audit_log
    where entity = 'households' and action = 'update'$$,
  $$values ('planner'::text, array['notes']::text[])$$,
  'a household change by the planner is audited as planner'
);

-- The couple changes an event.
select tests.authenticate_as(:'couple_user');
update public.events set name = 'Renamed event' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select tests.clear_auth();
select results_eq(
  $$select actor_kind, changed_fields from public.audit_log
    where entity = 'events' and action = 'update'$$,
  $$values ('couple'::text, array['name']::text[])$$,
  'an event change is audited'
);

-- An RSVP change by staff: audit row and history row.
select tests.authenticate_as(:'couple_user');
update public.invitations set status = 'attending'
  where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select tests.clear_auth();
select results_eq(
  $$select actor_kind, changed_fields from public.audit_log
    where entity = 'invitations' and action = 'update'$$,
  $$values ('couple'::text, array['status']::text[])$$,
  'an invitation change is audited'
);
select results_eq(
  $$select old_status::text, new_status::text, changed_by, actor_kind from public.rsvp_history$$,
  format($$values ('pending'::text, 'attending'::text, %L::uuid, 'couple'::text)$$, :'couple_user'),
  'a status change writes an RSVP history row'
);
select ok(
  (select changed_at is not null from public.rsvp_history), 'history rows carry a timestamp'
);

-- A change made on behalf of the signed-in household (as the RSVP functions will do).
select set_config('request.jwt.claims', json_build_object('sub', :'guest_user', 'role', 'authenticated')::text, true);
update public.invitations set status = 'declined'
  where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select old_status::text, new_status::text, actor_kind from public.rsvp_history order by id desc limit 1$$,
  $$values ('attending'::text, 'declined'::text, 'guest'::text)$$,
  'a household responder change is recorded with actor kind guest'
);
select is(
  (select count(*) from public.audit_log where entity = 'invitations' and actor_kind = 'guest'),
  1::bigint, 'the same change is audited with actor kind guest'
);

-- A save that does not change the status writes no history.
update public.invitations set responded_at = now()
  where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select is((select count(*) from public.rsvp_history), 2::bigint, 'no history row without a status change');

-- Table shapes: no names, emails or values anywhere.
select columns_are(
  'public', 'audit_log',
  array['id', 'at', 'actor_user_id', 'actor_kind', 'entity', 'entity_id', 'action', 'changed_fields'],
  'audit_log holds no personal data columns'
);
select columns_are(
  'public', 'rsvp_history',
  array['id', 'guest_id', 'event_id', 'old_status', 'new_status', 'changed_by', 'actor_kind', 'changed_at'],
  'rsvp_history holds no personal data columns'
);

-- Deleting a guest keeps history but drops the link to the person.
delete from public.guests where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select is(
  (select count(*) from public.rsvp_history where guest_id is not null), 0::bigint,
  'deleting a guest sets rsvp_history.guest_id to null'
);
select is((select count(*) from public.rsvp_history), 2::bigint, 'the history rows are kept');
select is(
  (select count(*) from public.audit_log where entity = 'guests' and action = 'delete'),
  1::bigint, 'deleting a guest is audited'
);
select results_eq(
  $$select changed_fields from public.audit_log where entity = 'guests' and action = 'delete'$$,
  $$values (array[]::text[])$$,
  'a delete audit row lists no fields'
);

-- Access: staff read, nobody else, nobody writes.
select tests.authenticate_as(:'planner_user');
select ok((select count(*) from public.audit_log) > 0, 'staff can select audit_log');
select ok((select count(*) from public.rsvp_history) > 0, 'staff can select rsvp_history');
select throws_ok(
  $$insert into public.audit_log (actor_kind, entity, action) values ('couple', 'guests', 'update')$$,
  '42501', null, 'staff cannot insert into audit_log'
);
select throws_ok(
  $$update public.audit_log set entity = 'x'$$, '42501', null, 'staff cannot update audit_log'
);
select throws_ok($$delete from public.audit_log$$, '42501', null, 'staff cannot delete from audit_log');
select throws_ok(
  $$insert into public.rsvp_history (actor_kind) values ('couple')$$, '42501', null,
  'staff cannot insert into rsvp_history'
);
select throws_ok(
  $$update public.rsvp_history set actor_kind = 'x'$$, '42501', null, 'staff cannot update rsvp_history'
);
select throws_ok($$delete from public.rsvp_history$$, '42501', null, 'staff cannot delete from rsvp_history');
select tests.clear_auth();

select tests.authenticate_as(:'guest_user');
select is((select count(*) from public.audit_log), 0::bigint, 'a guest sees no audit rows');
select is((select count(*) from public.rsvp_history), 0::bigint, 'a guest sees no history rows');
select tests.clear_auth();

select tests.authenticate_anon();
select throws_ok('select * from public.audit_log', '42501', null, 'anon cannot read audit_log');
select throws_ok('select * from public.rsvp_history', '42501', null, 'anon cannot read rsvp_history');
select tests.clear_auth();

select * from finish();
rollback;
