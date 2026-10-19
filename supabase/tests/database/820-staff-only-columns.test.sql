-- Columns meant for staff (the couple's private notes, the delivery problem flag,
-- deadline overrides, addresses, who invited or answered) cannot be read
-- directly by a signed-in guest, even for the guest's own household. Staff read
-- them through the staff_households, staff_guests and staff_invitations
-- functions and still write them directly.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(28);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'), (:'planner_user', 'planner', 'Planner');

insert into public.households (id, display_name, contact_email, auth_user_id, notes, address, rsvp_deadline_override, delivery_problem) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a',
   'private couple note', '{"street":"1 Example Road"}', now() + interval '3 days', true);
insert into public.guests (id, household_id, first_name, last_name, notes) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha', 'private guest note');
insert into public.events (id, slug, name, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true);
insert into public.invitations (guest_id, event_id, status, invited_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'pending', :'couple_user');

-- A guest.
select tests.authenticate_as(:'user_a');
select throws_ok($$select notes from public.households$$, '42501', null, 'a guest cannot read households.notes');
select throws_ok($$select delivery_problem from public.households$$, '42501', null, 'a guest cannot read households.delivery_problem');
select throws_ok($$select rsvp_deadline_override from public.households$$, '42501', null, 'a guest cannot read households.rsvp_deadline_override');
select throws_ok($$select address from public.households$$, '42501', null, 'a guest cannot read households.address');
select throws_ok($$select * from public.households$$, '42501', null, 'a guest cannot select * from households');
select throws_ok($$select notes from public.guests$$, '42501', null, 'a guest cannot read guests.notes');
select throws_ok($$select * from public.guests$$, '42501', null, 'a guest cannot select * from guests');
select throws_ok($$select invited_by from public.invitations$$, '42501', null, 'a guest cannot read invitations.invited_by');
select throws_ok($$select responded_by from public.invitations$$, '42501', null, 'a guest cannot read invitations.responded_by');
select throws_ok($$select * from public.invitations$$, '42501', null, 'a guest cannot select * from invitations');
select throws_ok($$select id from public.households where notes is not null$$, '42501', null, 'a guest cannot probe notes through a filter');
select is((select display_name from public.households), 'Household A', 'a guest still reads the household display name');
select is((select first_name from public.guests), 'Ada', 'a guest still reads their guests names');
select is((select status::text from public.invitations), 'pending', 'a guest still reads their invitation status');
select throws_ok($$select * from public.staff_households()$$, 'P0001', 'forbidden', 'a guest cannot call staff_households');
select throws_ok($$select * from public.staff_guests()$$, 'P0001', 'forbidden', 'a guest cannot call staff_guests');
select throws_ok($$select * from public.staff_invitations()$$, 'P0001', 'forbidden', 'a guest cannot call staff_invitations');
select tests.clear_auth();

-- A visitor who is not signed in.
select tests.authenticate_anon();
select throws_ok($$select * from public.staff_households()$$, '42501', null, 'anon cannot call staff_households');
select tests.clear_auth();

-- Staff: read through the functions, write directly.
select tests.authenticate_as(:'couple_user');
select is((select notes from public.staff_households() where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'private couple note', 'staff read households.notes through staff_households');
select is((select delivery_problem from public.staff_households() where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), true, 'staff read households.delivery_problem through staff_households');
select is((select notes from public.staff_guests() where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 'private guest note', 'staff read guests.notes through staff_guests');
select is((select invited_by from public.staff_invitations() limit 1), :'couple_user'::uuid, 'staff read invitations.invited_by through staff_invitations');
select lives_ok($$update public.households set notes = 'edited note' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, 'staff write households.notes directly');
select lives_ok($$update public.guests set notes = 'edited guest note' where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'$$, 'staff write guests.notes directly');
select is((select notes from public.staff_households() where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'edited note', 'the staff write is visible through staff_households');
select tests.clear_auth();

-- The planner has the same access.
select tests.authenticate_as(:'planner_user');
select is((select notes from public.staff_households() where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'edited note', 'the planner reads notes through staff_households');
select tests.clear_auth();

-- The service role (route handlers and scripts) still reads everything.
select tests.authenticate_service_role();
select is((select notes from public.households), 'edited note', 'the service role reads households.notes');
select is((select notes from public.guests), 'edited guest note', 'the service role reads guests.notes');
select tests.clear_auth();

select * from finish();
rollback;
