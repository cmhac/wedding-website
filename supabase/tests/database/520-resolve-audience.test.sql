-- resolve_audience: every filter in the audience-filter contract, combined
-- filters, the deliverable and skip_reason output, and who may call it.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(34);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');

-- Seven households:
--   A  ceremony pending, welcome party pending
--   B  ceremony attending (no meal yet), welcome party pending, bounced invitation
--   C  ceremony attending (meal chosen), welcome party declined, queued invitation
--   D  no email, ceremony pending
--   E  opted out, delivery problem, ceremony pending
--   F  rehearsal pending only, invitation sent
--   G  ceremony attending (meal chosen), invitation delivered
insert into public.households (id, display_name, contact_email, auth_user_id, reminders_opt_out, delivery_problem) values
  ('00000001-0000-0000-0000-000000000000', 'Household A', 'a@example.test', :'user_a', false, false),
  ('00000002-0000-0000-0000-000000000000', 'Household B', 'b@example.test', null, false, false),
  ('00000003-0000-0000-0000-000000000000', 'Household C', 'c@example.test', null, false, false),
  ('00000004-0000-0000-0000-000000000000', 'Household D', null, null, false, false),
  ('00000005-0000-0000-0000-000000000000', 'Household E', 'e@example.test', null, true, true),
  ('00000006-0000-0000-0000-000000000000', 'Household F', 'f@example.test', null, false, false),
  ('00000007-0000-0000-0000-000000000000', 'Household G', 'g@example.test', null, false, false);
insert into public.guests (household_id, first_name, last_name)
select h.id, 'Guest' || right(h.display_name, 1), 'Fixture' from public.households h;
insert into public.events (id, slug, name, is_required, display_order) values
  ('11111111-0000-0000-0000-00000000000e', 'ceremony', 'Ceremony', true, 1),
  ('22222222-0000-0000-0000-00000000000e', 'welcome-party', 'Welcome Party', false, 2),
  ('33333333-0000-0000-0000-00000000000e', 'rehearsal', 'Rehearsal', false, 3);
insert into public.invitations (guest_id, event_id, status)
select g.id, e.id, v.status::public.rsvp_status
from (values
  ('GuestA', 'ceremony', 'pending'), ('GuestA', 'welcome-party', 'pending'),
  ('GuestB', 'ceremony', 'attending'), ('GuestB', 'welcome-party', 'pending'),
  ('GuestC', 'ceremony', 'attending'), ('GuestC', 'welcome-party', 'declined'),
  ('GuestD', 'ceremony', 'pending'),
  ('GuestE', 'ceremony', 'pending'),
  ('GuestF', 'rehearsal', 'pending'),
  ('GuestG', 'ceremony', 'attending')
) as v (first_name, slug, status)
join public.guests g on g.first_name = v.first_name
join public.events e on e.slug = v.slug;

-- The ceremony menu is published with one course that needs a choice.
insert into public.menus (id, event_id, status) values
  ('aaaa0000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000e', 'published');
insert into public.courses (id, menu_id, name, display_order, requires_choice) values
  ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'Main', 1, true);
insert into public.dishes (id, course_id, name) values
  ('cccc0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'Dish One');
insert into public.meal_selections (guest_id, course_id, dish_id)
select g.id, 'bbbb0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001'
from public.guests g where g.first_name in ('GuestC', 'GuestG');

insert into public.message_types (key, label, is_essential, template_key) values
  ('invitation', 'Invitation', true, 'invitation'),
  ('rsvp_reminder', 'RSVP reminder', false, 'rsvp_reminder');
insert into public.campaigns (id, message_type_key, name, audience, status) values
  ('dddd0000-0000-0000-0000-000000000001', 'invitation', 'Invitations', '{"scope":"all"}', 'done'),
  ('dddd0000-0000-0000-0000-000000000002', 'rsvp_reminder', 'Reminders', '{"scope":"all"}', 'done');
insert into public.messages (campaign_id, household_id, status) values
  ('dddd0000-0000-0000-0000-000000000001', '00000002-0000-0000-0000-000000000000', 'bounced'),
  ('dddd0000-0000-0000-0000-000000000001', '00000003-0000-0000-0000-000000000000', 'queued'),
  ('dddd0000-0000-0000-0000-000000000001', '00000006-0000-0000-0000-000000000000', 'sent'),
  ('dddd0000-0000-0000-0000-000000000001', '00000007-0000-0000-0000-000000000000', 'delivered'),
  -- A reminder that was sent does not count against the invitation filter.
  ('dddd0000-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000000', 'sent');

-- Who may call it.
select tests.authenticate_anon();
select throws_ok($$select * from public.resolve_audience('{"scope":"all"}')$$, '42501', null, 'anon cannot call resolve_audience');
select tests.clear_auth();
select tests.authenticate_as(:'user_a');
select throws_ok($$select * from public.resolve_audience('{"scope":"all"}')$$, 'P0001', 'forbidden', 'a guest gets forbidden');
select tests.clear_auth();

select tests.authenticate_as(:'couple_user');

select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"all"}')),
  array['Household A','Household B','Household C','Household D','Household E','Household F','Household G'],
  'scope all returns every household, including those with no email'
);
select is(
  (select array_agg(display_name) from public.resolve_audience('{"scope":"household","household_id":"00000003-0000-0000-0000-000000000000"}')),
  array['Household C'], 'scope household returns that household'
);
select is_empty(
  $$select * from public.resolve_audience('{"scope":"household","household_id":"99999999-0000-0000-0000-000000000000"}')$$,
  'scope household with an unknown id returns nothing'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"invited_to_event":"welcome-party"}}')),
  array['Household A','Household B','Household C'], 'invited_to_event'
);
select is_empty(
  $$select * from public.resolve_audience('{"scope":"filter","filters":{"invited_to_event":"no-such-event"}}')$$,
  'invited_to_event with an unknown slug returns nothing'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"required_events_unanswered":true}}')),
  array['Household A','Household D','Household E'],
  'required_events_unanswered ignores optional events (F has only a pending rehearsal)'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"optional_event_unanswered":"welcome-party"}}')),
  array['Household A','Household B'],
  'optional_event_unanswered includes a household that answered every required event'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"optional_event_unanswered":"rehearsal"}}')),
  array['Household F'], 'optional_event_unanswered for another event'
);
select is_empty(
  $$select * from public.resolve_audience('{"scope":"filter","filters":{"optional_event_unanswered":"ceremony"}}')$$,
  'optional_event_unanswered never matches a required event'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"meals_not_chosen":true}}')),
  array['Household B'], 'meals_not_chosen finds the attending guest with no selection'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"not_yet_sent_message_type":"invitation"}}')),
  array['Household A','Household B','Household C','Household D','Household E'],
  'not_yet_sent_message_type excludes sent and delivered, not queued or bounced, and not other types'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"delivery_problem":true}}')),
  array['Household E'], 'delivery_problem'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"required_events_unanswered":true,"delivery_problem":true}}')),
  array['Household E'], 'filters combine with AND'
);
select is(
  (select array_agg(display_name order by display_name) from public.resolve_audience('{"scope":"filter","filters":{"required_events_unanswered":true,"not_yet_sent_message_type":"invitation","invited_to_event":"welcome-party"}}')),
  array['Household A'], 'three filters combine with AND'
);
select is_empty(
  $$select * from public.resolve_audience('{"scope":"filter","filters":{"meals_not_chosen":true,"delivery_problem":true}}')$$,
  'filters with no common household return nothing'
);

-- Meal rule: a draft menu or a course with no dishes creates no pending meal.
update public.menus set status = 'draft';
select is_empty(
  $$select * from public.resolve_audience('{"scope":"filter","filters":{"meals_not_chosen":true}}')$$,
  'a draft menu means no meals are outstanding'
);
update public.menus set status = 'published';

-- Output: deliverable and skip_reason.
select results_eq(
  $$select display_name, deliverable, skip_reason from public.resolve_audience('{"scope":"all"}', 'rsvp_reminder') order by display_name$$,
  $$values
    ('Household A'::text, true, null::text),
    ('Household B', true, null),
    ('Household C', true, null),
    ('Household D', false, 'no_email'),
    ('Household E', false, 'opted_out'),
    ('Household F', true, null),
    ('Household G', true, null)$$,
  'a non-essential type skips households with no email or an opt-out'
);
select results_eq(
  $$select display_name, deliverable, skip_reason from public.resolve_audience('{"scope":"all"}', 'invitation') where display_name in ('Household D', 'Household E') order by display_name$$,
  $$values ('Household D'::text, false, 'no_email'::text), ('Household E', true, null)$$,
  'an essential type still reaches an opted-out household, but not one with no email'
);
select is(
  (select deliverable from public.resolve_audience('{"scope":"all"}') where display_name = 'Household E'), true,
  'without a message type the opt-out is not applied (the claim step applies it)'
);
select is(
  (select skip_reason from public.resolve_audience('{"scope":"all"}') where display_name = 'Household D'), 'no_email',
  'without a message type a missing email is still reported'
);
select throws_ok(
  $$select * from public.resolve_audience('{"scope":"all"}', 'no_such_type')$$,
  'P0001', 'not_found', 'an unknown message type is not_found'
);
select is(
  (select count(*) from public.resolve_audience('{"scope":"all"}')), 7::bigint, 'one row per household'
);

select throws_ok(
  $$select * from public.resolve_audience('{"scope":"filter","filters":{"favourite_colour":"red"}}')$$,
  'P0001', 'invalid_payload', 'an invalid audience is invalid_payload'
);
select throws_ok(
  $$select * from public.resolve_audience('{"scope":"all","filters":{"delivery_problem":true}}')$$,
  'P0001', 'invalid_payload', 'scope all with filters is invalid_payload'
);
select throws_ok(
  $$select * from public.resolve_audience(null)$$,
  'P0001', 'invalid_payload', 'a null audience is invalid_payload'
);
select tests.clear_auth();

-- The planner is staff too, and the service role (route handlers) can call it.
select tests.authenticate_service_role();
select is(
  (select count(*) from public.resolve_audience('{"scope":"all"}')), 7::bigint,
  'the service role can resolve an audience'
);
select tests.clear_auth();

-- is_valid_audience mirrors the contract.
select ok(public.is_valid_audience('{"scope":"all"}'), 'is_valid_audience accepts all');
select ok(not public.is_valid_audience('{"scope":"all","household_id":"00000001-0000-0000-0000-000000000000"}'), 'all with a household id is invalid');
select ok(not public.is_valid_audience('[]'), 'a non-object audience is invalid');
select ok(not public.is_valid_audience(null), 'a null audience is invalid');
select ok(not public.is_valid_audience('{"scope":"filter","filters":{"invited_to_event":"Bad Slug"}}'), 'an event slug must look like a slug');
select ok(not has_function_privilege('anon', 'public.resolve_audience(jsonb, text)', 'execute'), 'anon has no execute on resolve_audience');

select * from finish();
rollback;
