-- get_my_rsvp, submit_household_rsvp (attendance, dietary notes, message), and
-- name_plus_one. Structured dietary data and meals are covered by 320.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(46);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset
select tests.create_user('outsider@example.test') as outsider \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'), (:'planner_user', 'planner', 'Planner');

update public.settings set default_rsvp_deadline = now() + interval '30 days', rsvp_open = true;

-- Household A allows two plus-ones. Household B is another responder. Household
-- C belongs to the planner, who is also a guest.
insert into public.households (id, display_name, contact_email, auth_user_id, plus_one_allowance, message_to_couple, notes, address) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a', 2, null, 'staff-only note', '{"street": "1 Example Road"}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b', 0, null, null, null),
  ('cccccccc-0000-0000-0000-00000000000c', 'Household C', 'c@example.test', :'planner_user', 0, null, null, null);
insert into public.guests (id, household_id, first_name, last_name, is_placeholder, is_plus_one, notes) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha', false, false, 'guest staff note'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha', false, false, null),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', null, null, true, true, null),
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-00000000000a', null, null, true, true, null),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta', false, false, null),
  ('cccccccc-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-00000000000c', 'Cleo', 'Gamma', false, false, null);
insert into public.events (id, slug, name, starts_at, venue_name, is_required, group_key, display_order, rsvp_deadline) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'open-event', 'Open Event', '2027-06-12T14:00:00Z', 'Venue One', true, 'weekend', 2, null),
  ('eeeeeeee-0000-0000-0000-000000000002', 'closed-event', 'Closed Event', '2027-06-11T18:00:00Z', 'Venue Two', false, 'weekend', 1, '2000-01-01T00:00:00Z'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'b-only-event', 'B Only Event', null, null, false, null, 3, null);
-- Ada: open + closed (already declined the closed one). Alan, plus-ones: open.
-- The second plus-one seat is invited only to the closed event.
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'pending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000002', 'declined'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001', 'pending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'eeeeeeee-0000-0000-0000-000000000001', 'pending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'eeeeeeee-0000-0000-0000-000000000002', 'pending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'pending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000003', 'pending'),
  ('cccccccc-0000-0000-0000-0000000000c1', 'eeeeeeee-0000-0000-0000-000000000002', 'pending');

-- Who can call what.
select tests.authenticate_anon();
select throws_ok($$select public.get_my_rsvp()$$, 'P0001', 'not_a_guest', 'anon gets not_a_guest from get_my_rsvp');
select throws_ok($$select public.submit_household_rsvp('{"guests": []}'::jsonb)$$, 'P0001', 'not_a_guest', 'anon gets not_a_guest from submit_household_rsvp');
select throws_ok(
  $$select public.name_plus_one('aaaaaaaa-0000-0000-0000-0000000000a3', 'Pat', 'Plus')$$,
  'P0001', 'not_a_guest', 'anon gets not_a_guest from name_plus_one'
);
select tests.clear_auth();
select tests.authenticate_as(:'outsider');
select throws_ok($$select public.get_my_rsvp()$$, 'P0001', 'not_a_guest', 'a signed-in user with no household gets not_a_guest');
select tests.clear_auth();
select tests.authenticate_as(:'couple_user');
select throws_ok($$select public.get_my_rsvp()$$, 'P0001', 'not_a_guest', 'staff with no household of their own get not_a_guest');
select tests.clear_auth();

-- Reading.
select tests.authenticate_as(:'user_a');
select public.get_my_rsvp()::text as rsvp \gset
select tests.clear_auth();

select is((:'rsvp'::jsonb) #>> '{household,display_name}', 'Household A', 'get_my_rsvp returns the caller household');
select is(
  (select array_agg(k order by k) from jsonb_object_keys((:'rsvp'::jsonb) -> 'household') k),
  array['display_name', 'message_to_couple', 'plus_one_allowance', 'reminders_opt_out'],
  'the household carries only the fields the guest API documents (no notes, address, or ids)'
);
select is(jsonb_array_length((:'rsvp'::jsonb) -> 'guests'), 4, 'all four seats of household A are returned');
select is(
  (select array_agg(k order by k) from jsonb_object_keys((:'rsvp'::jsonb) #> '{guests,0}') k),
  array['dietary', 'dietary_notes', 'first_name', 'id', 'invitations', 'is_placeholder', 'last_name'],
  'a guest carries only the documented fields (no staff notes or email)'
);
select ok(
  position('Bea' in (:'rsvp')) = 0 and position('Household B' in (:'rsvp')) = 0
    and position('b-only-event' in (:'rsvp')) = 0,
  'nothing of household B appears, and events A is not invited to are omitted'
);
select ok(
  position('staff-only note' in (:'rsvp')) = 0 and position('guest staff note' in (:'rsvp')) = 0
    and position('Example Road' in (:'rsvp')) = 0,
  'staff notes and the address never appear'
);
select results_eq(
  format($$select e ->> 'slug', (e ->> 'is_required')::boolean, e ->> 'group_key', (e ->> 'display_order')::int,
                  e ->> 'deadline' is not null, (e ->> 'closed')::boolean, i ->> 'status'
             from jsonb_array_elements(%L::jsonb -> 'guests') g,
                  jsonb_array_elements(g -> 'invitations') i,
                  lateral (select i -> 'event' as e) ev
            where g ->> 'first_name' = 'Ada' order by (e ->> 'display_order')::int$$, :'rsvp'),
  $$values
    ('closed-event'::text, false, 'weekend'::text, 1, true, true, 'declined'::text),
    ('open-event', true, 'weekend', 2, true, false, 'pending')$$,
  'each invitation carries is_required, group_key, display_order, the effective deadline, whether it is closed, and the status'
);
select is(
  (select jsonb_array_length(g -> 'invitations') from jsonb_array_elements((:'rsvp'::jsonb) -> 'guests') g where g ->> 'first_name' = 'Alan'),
  1, 'a guest is shown only the events they are invited to'
);

-- Submitting.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"message_to_couple": "Looking forward to it",
   "guests": [
     {"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "dietary_notes": "no onions",
      "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "attending"}]},
     {"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a2",
      "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "declined"}]}
   ]}$json$::jsonb)::text as saved \gset
select tests.clear_auth();

select results_eq(
  $$select g.first_name, i.status::text, i.responded_by is not null from public.invitations i
      join public.guests g on g.id = i.guest_id
     where i.event_id = 'eeeeeeee-0000-0000-0000-000000000001' and g.household_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
       and g.first_name is not null order by g.first_name$$,
  $$values ('Ada'::text, 'attending'::text, true), ('Alan', 'declined', true)$$,
  'answers are saved with who answered'
);
select is(
  (select responded_by from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  :'user_a'::uuid, 'responded_by is the guest account'
);
select isnt(
  (select responded_at from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  null, 'responded_at is set'
);
select is((select dietary_notes from public.guests where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 'no onions', 'dietary notes are saved');
select is((select message_to_couple from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'Looking forward to it', 'the message to the couple is saved');
select is((:'saved'::jsonb) #>> '{household,message_to_couple}', 'Looking forward to it', 'submit returns the updated get_my_rsvp body');
select results_eq(
  $$select guest_id::text, new_status::text, actor_kind, changed_by from public.rsvp_history order by guest_id$$,
  format($$values
    ('aaaaaaaa-0000-0000-0000-0000000000a1'::text, 'attending'::text, 'guest'::text, %1$L::uuid),
    ('aaaaaaaa-0000-0000-0000-0000000000a2', 'declined', 'guest', %1$L::uuid)$$, :'user_a'),
  'each status change writes rsvp_history as a guest'
);
select is(
  (select count(*) from public.audit_log where entity = 'invitations' and action = 'update' and actor_kind = 'guest'),
  2::bigint, 'and audit_log with actor kind guest'
);
select is(
  (select count(*) from public.audit_log where entity = 'guests' and action = 'update' and actor_kind = 'guest' and changed_fields = array['dietary_notes']),
  1::bigint, 'dietary notes changes are audited by column name'
);

-- A re-save with nothing changed writes no new history.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "dietary_notes": "no onions",
     "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "attending"}]}]}$json$::jsonb);
select tests.clear_auth();
select is((select count(*) from public.rsvp_history), 2::bigint, 'an unchanged answer writes no history');

-- Answers can change before the deadline.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a2",
     "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "attending"}]}]}$json$::jsonb);
select tests.clear_auth();
select is(
  (select status::text from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'attending', 'a guest can change their answer while the event is open'
);

-- Nothing about other households.
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "bbbbbbbb-0000-0000-0000-0000000000b1", "responses": []}]}'::jsonb)$$,
  'P0001', 'forbidden', 'using another household guest id is forbidden'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000003", "status": "attending"}]}]}'::jsonb)$$,
  'P0001', 'forbidden', 'answering an event the guest is not invited to is forbidden'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a2", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000002", "status": "attending"}]}]}'::jsonb)$$,
  'P0001', 'forbidden', 'an event only another guest in the household is invited to is forbidden'
);
select throws_ok(
  $$select public.name_plus_one('bbbbbbbb-0000-0000-0000-0000000000b1', 'Pat', 'Plus')$$,
  'P0001', 'forbidden', 'naming a plus-one in another household is forbidden'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "pending"}]}]}'::jsonb)$$,
  'P0001', 'invalid_payload', 'an answer must be attending or declined'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": "nope"}'::jsonb)$$,
  'P0001', 'invalid_payload', 'a payload without a guest list is invalid'
);
select tests.clear_auth();
select is(
  (select status::text from public.invitations where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'pending', 'household B is untouched'
);

-- Deadlines: a changed answer on a closed event is refused, and the whole payload fails.
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000002", "status": "attending"}]}]}'::jsonb)$$,
  'P0001', 'rsvp_closed', 'changing an answer after the event deadline raises rsvp_closed'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"message_to_couple": "late", "guests": [
      {"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "dietary_notes": "changed",
       "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "declined"},
                     {"event_id": "eeeeeeee-0000-0000-0000-000000000002", "status": "attending"}]}]}'::jsonb)$$,
  'P0001', 'rsvp_closed', 'a payload that is partly past its deadline is refused'
);
select tests.clear_auth();
select results_eq(
  $$select (select status::text from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
          (select dietary_notes from public.guests where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
          (select message_to_couple from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  $$values ('attending'::text, 'no onions'::text, 'Looking forward to it'::text)$$,
  'and nothing in it was saved (atomic)'
);
select tests.authenticate_as(:'user_a');
select lives_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000002", "status": "declined"}]}]}'::jsonb)$$,
  'sending back an unchanged answer for a closed event is not an error'
);
select tests.clear_auth();

-- Staff are not bound by the deadline (the planner is also a guest in household C).
select tests.authenticate_as(:'planner_user');
select lives_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "cccccccc-0000-0000-0000-0000000000c1", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000002", "status": "attending"}]}]}'::jsonb)$$,
  'staff are not bound by the deadline'
);
select tests.clear_auth();
select results_eq(
  $$select actor_kind from public.rsvp_history where guest_id = 'cccccccc-0000-0000-0000-0000000000c1'$$,
  $$values ('planner'::text)$$, 'and their change is recorded as the planner'
);

-- Plus-ones.
select tests.authenticate_as(:'user_a');
select public.name_plus_one('aaaaaaaa-0000-0000-0000-0000000000a3', '  Pat ', 'Plus')::text as named \gset
select tests.clear_auth();
select is((:'named'::jsonb) ->> 'first_name', 'Pat', 'a placeholder can be named, and the guest is returned');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(:'named'::jsonb) k),
  array['dietary_notes', 'first_name', 'id', 'is_placeholder', 'last_name'],
  'the returned guest carries only the documented fields'
);
select results_eq(
  $$select first_name, last_name, is_placeholder, is_plus_one from public.guests where id = 'aaaaaaaa-0000-0000-0000-0000000000a3'$$,
  $$values ('Pat'::text, 'Plus'::text, false, true)$$,
  'the names are trimmed and saved; the seat still counts as a plus-one'
);
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.name_plus_one('aaaaaaaa-0000-0000-0000-0000000000a3', 'Other', 'Name')$$,
  'P0001', 'not_a_placeholder', 'naming a guest who is already named raises not_a_placeholder'
);
select throws_ok(
  $$select public.name_plus_one('aaaaaaaa-0000-0000-0000-0000000000a1', 'Other', 'Name')$$,
  'P0001', 'not_a_placeholder', 'so does an ordinary guest'
);
select throws_ok(
  $$select public.name_plus_one('aaaaaaaa-0000-0000-0000-0000000000a4', 'Late', 'Plus')$$,
  'P0001', 'rsvp_closed', 'naming a plus-one whose events are all past their deadline raises rsvp_closed'
);
select throws_ok(
  $$select public.name_plus_one('aaaaaaaa-0000-0000-0000-0000000000a4', ' ', 'Plus')$$,
  'P0001', 'invalid_payload', 'a blank name is invalid'
);
select tests.clear_auth();

-- RSVPs switched off for everyone.
update public.settings set rsvp_open = false;
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a2", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "declined"}]}]}'::jsonb)$$,
  'P0001', 'rsvp_closed', 'nothing can be answered while RSVPs are closed'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"message_to_couple": "hi", "guests": []}'::jsonb)$$,
  'P0001', 'rsvp_closed', 'nor can anything else be saved'
);
select tests.clear_auth();

select * from finish();
rollback;
