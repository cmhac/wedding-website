-- claim_campaign_messages, record_message_event, due_scheduled_campaigns, and
-- the rule that changing a household's contact email clears its delivery problem.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(65);

select tests.create_user('couple@example.test') as couple_user \gset

insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');
insert into public.message_types (key, label, is_essential, template_key) values
  ('invitation', 'Invitation', true, 'invitation'),
  ('rsvp_reminder', 'RSVP reminder', false, 'rsvp_reminder');

-- Households: A, B and C are ordinary; D's email is cleared after queueing; X is
-- deleted after queueing; O opts out after queueing.
insert into public.households (id, display_name) values
  ('0000000a-0000-0000-0000-000000000000', 'Household A'),
  ('0000000b-0000-0000-0000-000000000000', 'Household B'),
  ('0000000c-0000-0000-0000-000000000000', 'Household C'),
  ('0000000d-0000-0000-0000-000000000000', 'Household D'),
  ('0000000e-0000-0000-0000-000000000000', 'Household X'),
  ('0000000f-0000-0000-0000-000000000000', 'Household O');
insert into public.household_contacts (household_id, kind, value, delivery_problem) values
  ('0000000a-0000-0000-0000-000000000000', 'email', 'a@example.test', false),
  ('0000000b-0000-0000-0000-000000000000', 'email', 'b@example.test', false),
  ('0000000c-0000-0000-0000-000000000000', 'email', 'c@example.test', false),
  ('0000000d-0000-0000-0000-000000000000', 'email', 'd@example.test', false),
  ('0000000e-0000-0000-0000-000000000000', 'email', 'x@example.test', false),
  ('0000000f-0000-0000-0000-000000000000', 'email', 'o@example.test', false);

insert into public.campaigns (id, message_type_key, name, audience, status, scheduled_for) values
  ('c0000001-0000-0000-0000-000000000000', 'rsvp_reminder', 'Reminder', '{"scope":"all"}', 'sending', null),
  ('c0000002-0000-0000-0000-000000000000', 'invitation', 'Essential', '{"scope":"all"}', 'sending', null),
  ('c0000003-0000-0000-0000-000000000000', 'rsvp_reminder', 'Not started', '{"scope":"all"}', 'scheduled', now() + interval '1 hour'),
  ('c0000004-0000-0000-0000-000000000000', 'rsvp_reminder', 'Skips first', '{"scope":"all"}', 'sending', null);

insert into public.messages (id, campaign_id, household_id, status) values
  ('a0000001-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'queued'),
  ('a0000002-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', 'queued'),
  ('a0000003-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', 'queued'),
  ('a0000004-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000d-0000-0000-0000-000000000000', 'queued'),
  ('a0000005-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000e-0000-0000-0000-000000000000', 'queued'),
  ('a0000006-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000f-0000-0000-0000-000000000000', 'queued'),
  ('a0000007-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', '0000000f-0000-0000-0000-000000000000', 'queued'),
  ('a0000008-0000-0000-0000-000000000000', 'c0000003-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'queued'),
  ('a0000009-0000-0000-0000-000000000000', 'c0000004-0000-0000-0000-000000000000', '0000000d-0000-0000-0000-000000000000', 'queued'),
  ('a000000a-0000-0000-0000-000000000000', 'c0000004-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'queued');

-- Things that change after queueing.
update public.household_contacts set value = 'b-new@example.test' where household_id = '0000000b-0000-0000-0000-000000000000';
delete from public.household_contacts where household_id = '0000000d-0000-0000-0000-000000000000';
delete from public.households where id = '0000000e-0000-0000-0000-000000000000';
update public.households set reminders_opt_out = true where id = '0000000f-0000-0000-0000-000000000000';

-- Execute permissions: service role only.
select tests.authenticate_anon();
select throws_ok($$select * from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10)$$, '42501', null, 'anon cannot claim');
select throws_ok($$select public.record_message_event('e', 'p', 'email.sent', now())$$, '42501', null, 'anon cannot record events');
select throws_ok($$select * from public.due_scheduled_campaigns()$$, '42501', null, 'anon cannot list due campaigns');
select tests.clear_auth();
select tests.authenticate_as(:'couple_user');
select throws_ok($$select * from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10)$$, '42501', null, 'staff cannot claim');
select throws_ok($$select public.record_message_event('e', 'p', 'email.sent', now())$$, '42501', null, 'staff cannot record events');
select throws_ok($$select * from public.due_scheduled_campaigns()$$, '42501', null, 'staff cannot list due campaigns');
select tests.clear_auth();
select ok(
  not has_function_privilege('authenticated', 'public.claim_campaign_messages(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.record_message_event(text, text, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.due_scheduled_campaigns()', 'execute')
  and has_function_privilege('service_role', 'public.claim_campaign_messages(uuid, integer)', 'execute')
  and has_function_privilege('service_role', 'public.record_message_event(text, text, text, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.due_scheduled_campaigns()', 'execute'),
  'execute is revoked from anon and authenticated and kept for the service role'
);
select ok(
  pg_get_functiondef('public.claim_campaign_messages(uuid, integer)'::regprocedure) ilike '%for update skip locked%',
  'claim_campaign_messages locks rows with for update skip locked'
);

-- Claiming.
select tests.authenticate_service_role();
create temp table claim_one on commit drop as
  select * from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 2);
grant select on claim_one to public;
select tests.clear_auth();

select is((select count(*) from claim_one), 2::bigint, 'a claim of 2 returns 2 rows');
select results_eq(
  $$select id::text, household_id::text, to_email::text from claim_one order by id$$,
  $$values
    ('a0000001-0000-0000-0000-000000000000'::text, '0000000a-0000-0000-0000-000000000000'::text, 'a@example.test'::text),
    ('a0000002-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', 'b-new@example.test')$$,
  'claimed rows carry the current contact email, including one changed after queueing'
);
select is(
  (select count(*) from public.messages where id in (select id from claim_one) and status = 'sending'), 2::bigint,
  'claimed messages move to sending'
);
select is(
  (select to_email::text from public.messages where id = 'a0000002-0000-0000-0000-000000000000'), 'b-new@example.test',
  'the address used is written to the message'
);

select tests.authenticate_service_role();
create temp table claim_two on commit drop as
  select * from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10);
grant select on claim_two to public;
select tests.clear_auth();

select results_eq(
  $$select id::text from claim_two$$,
  $$values ('a0000003-0000-0000-0000-000000000000'::text)$$,
  'a second claim returns only what is left, never a row claimed before'
);
select is(
  (select count(*) from claim_one c1 join claim_two c2 using (id)), 0::bigint,
  'two claims never return the same row'
);
select results_eq(
  $$select status::text, skip_reason, to_email::text from public.messages where id = 'a0000004-0000-0000-0000-000000000000'$$,
  $$values ('skipped'::text, 'no_email'::text, null::text)$$,
  'a household whose email was cleared becomes skipped with no_email'
);
select results_eq(
  $$select status::text, skip_reason, to_email::text from public.messages where id = 'a0000005-0000-0000-0000-000000000000'$$,
  $$values ('skipped'::text, 'household_missing'::text, null::text)$$,
  'a deleted household becomes skipped with household_missing'
);
select results_eq(
  $$select status::text, skip_reason, to_email::text from public.messages where id = 'a0000006-0000-0000-0000-000000000000'$$,
  $$values ('skipped'::text, 'opted_out'::text, null::text)$$,
  'a household that opted out meanwhile is skipped for a non-essential type'
);
select tests.authenticate_service_role();
select is((select count(*) from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10)), 0::bigint, 'nothing is left to claim');
select results_eq(
  $$select id::text, to_email::text from public.claim_campaign_messages('c0000002-0000-0000-0000-000000000000', 10)$$,
  $$values ('a0000007-0000-0000-0000-000000000000'::text, 'o@example.test'::text)$$,
  'an essential type is still claimed for an opted-out household'
);
select is(
  (select count(*) from public.claim_campaign_messages('c0000003-0000-0000-0000-000000000000', 10)), 0::bigint,
  'a campaign that is not sending claims nothing'
);
select results_eq(
  $$select id::text from public.claim_campaign_messages('c0000004-0000-0000-0000-000000000000', 1)$$,
  $$values ('a000000a-0000-0000-0000-000000000000'::text)$$,
  'a batch that only skips keeps going until it finds a message to send'
);
select tests.clear_auth();
select is(
  (select status::text from public.messages where id = 'a0000008-0000-0000-0000-000000000000'), 'queued',
  'messages in a campaign that is not sending stay queued'
);

-- Stale claims: a message stuck in sending for over 15 minutes (a worker that
-- died) is claimed again, unless the provider already accepted it.
insert into public.households (id, display_name) values
  ('00000021-0000-0000-0000-000000000000', 'Household S1'),
  ('00000022-0000-0000-0000-000000000000', 'Household S2'),
  ('00000023-0000-0000-0000-000000000000', 'Household S3');
insert into public.household_contacts (household_id, kind, value, delivery_problem) values
  ('00000021-0000-0000-0000-000000000000', 'email', 's1@example.test', false),
  ('00000022-0000-0000-0000-000000000000', 'email', 's2@example.test', false),
  ('00000023-0000-0000-0000-000000000000', 'email', 's3@example.test', false);
insert into public.campaigns (id, message_type_key, name, audience, status) values
  ('c0000006-0000-0000-0000-000000000000', 'rsvp_reminder', 'Stale', '{"scope":"all"}', 'sending');
insert into public.messages (id, campaign_id, household_id, status, to_email, claimed_at, provider_message_id) values
  ('a1000001-0000-0000-0000-000000000000', 'c0000006-0000-0000-0000-000000000000', '00000021-0000-0000-0000-000000000000', 'sending', 'old-address@example.test', now() - interval '20 minutes', null),
  ('a1000002-0000-0000-0000-000000000000', 'c0000006-0000-0000-0000-000000000000', '00000022-0000-0000-0000-000000000000', 'sending', 's2@example.test', now() - interval '5 minutes', null),
  ('a1000003-0000-0000-0000-000000000000', 'c0000006-0000-0000-0000-000000000000', '00000023-0000-0000-0000-000000000000', 'sending', 's3@example.test', now() - interval '20 minutes', 'prov-s3');
select tests.authenticate_service_role();
select results_eq(
  $$select id::text, to_email::text from public.claim_campaign_messages('c0000006-0000-0000-0000-000000000000', 10)$$,
  $$values ('a1000001-0000-0000-0000-000000000000'::text, 's1@example.test'::text)$$,
  'a message stuck in sending for over 15 minutes is claimed again, with the current address'
);
select is(
  (select count(*) from public.claim_campaign_messages('c0000006-0000-0000-0000-000000000000', 10)), 0::bigint,
  'a re-claimed message is fresh again, so a second claim finds nothing'
);
select tests.clear_auth();
select is(
  (select status::text from public.messages where id = 'a1000002-0000-0000-0000-000000000000'), 'sending',
  'a recent claim is left alone'
);
select ok(
  (select claimed_at > now() - interval '1 minute' from public.messages where id = 'a1000001-0000-0000-0000-000000000000'),
  'claiming records when the message was claimed'
);
select is(
  (select claimed_at < now() - interval '15 minutes' from public.messages where id = 'a1000003-0000-0000-0000-000000000000'), true,
  'a stale message the provider already accepted is not claimed again'
);

-- Events. Messages already sent by the provider.
insert into public.households (id, display_name) values
  ('00000011-0000-0000-0000-000000000000', 'Household P'),
  ('00000012-0000-0000-0000-000000000000', 'Household Q'),
  ('00000013-0000-0000-0000-000000000000', 'Household R'),
  ('00000014-0000-0000-0000-000000000000', 'Household S');
insert into public.household_contacts (household_id, kind, value, delivery_problem) values
  ('00000011-0000-0000-0000-000000000000', 'email', 'p@example.test', false),
  ('00000012-0000-0000-0000-000000000000', 'email', 'q@example.test', false),
  ('00000013-0000-0000-0000-000000000000', 'email', 'r@example.test', false),
  ('00000014-0000-0000-0000-000000000000', 'email', 'old-s@example.test', false);
insert into public.campaigns (id, message_type_key, name, audience, status) values
  ('c0000005-0000-0000-0000-000000000000', 'rsvp_reminder', 'Events', '{"scope":"all"}', 'sending');
insert into public.messages (id, campaign_id, household_id, status, to_email, provider_message_id) values
  ('b0000001-0000-0000-0000-000000000000', 'c0000005-0000-0000-0000-000000000000', '00000011-0000-0000-0000-000000000000', 'sending', 'p@example.test', 'prov-p'),
  ('b0000002-0000-0000-0000-000000000000', 'c0000005-0000-0000-0000-000000000000', '00000012-0000-0000-0000-000000000000', 'sending', 'q@example.test', 'prov-q'),
  ('b0000003-0000-0000-0000-000000000000', 'c0000005-0000-0000-0000-000000000000', '00000013-0000-0000-0000-000000000000', 'sending', 'r@example.test', 'prov-r'),
  ('b0000004-0000-0000-0000-000000000000', 'c0000005-0000-0000-0000-000000000000', '00000014-0000-0000-0000-000000000000', 'sending', 'old-s@example.test', 'prov-s'),
  ('b0000005-0000-0000-0000-000000000000', 'c0000005-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'skipped', null, null);
update public.messages set provider_message_id = 'prov-skipped' where id = 'b0000005-0000-0000-0000-000000000000';
update public.household_contacts set value = 's@example.test' where household_id = '00000014-0000-0000-0000-000000000000';

select tests.authenticate_service_role();

-- P: sent, duplicate, delivered, a late sent, then a bounce.
select is(public.record_message_event('evt-p1', 'prov-p', 'email.sent', '2027-01-01T10:00:00Z'), 'applied', 'sent event applied');
select is((select status::text from public.messages where id = 'b0000001-0000-0000-0000-000000000000'), 'sent', 'status becomes sent');
select is((select sent_at from public.messages where id = 'b0000001-0000-0000-0000-000000000000'), '2027-01-01T10:00:00Z'::timestamptz, 'sent_at is filled from the event when empty');
select is(public.record_message_event('evt-p1', 'prov-p', 'email.sent', '2027-01-01T10:00:00Z'), 'duplicate', 'a redelivered event is a duplicate');
select is((select count(*) from public.message_events where provider_event_id = 'evt-p1'), 1::bigint, 'a duplicate adds no second event row');
select is(public.record_message_event('evt-p2', 'prov-p', 'email.delivered', '2027-01-01T10:00:05Z'), 'applied', 'delivered event applied');
select is((select status::text from public.messages where id = 'b0000001-0000-0000-0000-000000000000'), 'delivered', 'status becomes delivered');
select is(public.record_message_event('evt-p3', 'prov-p', 'email.sent', '2027-01-01T10:00:09Z'), 'ignored', 'a late sent after delivered is ignored');
select is((select status::text from public.messages where id = 'b0000001-0000-0000-0000-000000000000'), 'delivered', 'a late sent does not move the status back');
select is((select delivery_problem from public.households where id = '00000011-0000-0000-0000-000000000000'), false, 'no delivery problem yet');
select is(public.record_message_event('evt-p4', 'prov-p', 'email.bounced', '2027-01-01T11:00:00Z'), 'applied', 'a bounce wins over delivered');
select is((select status::text from public.messages where id = 'b0000001-0000-0000-0000-000000000000'), 'bounced', 'status becomes bounced');
select is((select delivery_problem from public.households where id = '00000011-0000-0000-0000-000000000000'), true, 'a bounce sets the delivery problem flag');
select is(public.record_message_event('evt-p5', 'prov-p', 'email.delivered', '2027-01-01T11:00:01Z'), 'ignored', 'nothing moves a bounced message');
select is(public.record_message_event('evt-p6', 'prov-p', 'email.complained', '2027-01-01T11:00:02Z'), 'ignored', 'a second terminal event does not replace the first');
select is((select status::text from public.messages where id = 'b0000001-0000-0000-0000-000000000000'), 'bounced', 'the first terminal status stays');

-- Q: delivered straight from sending (sent skipped), then a complaint.
select is(public.record_message_event('evt-q1', 'prov-q', 'email.delivered', now()), 'applied', 'delivered can arrive before sent');
select is(public.record_message_event('evt-q2', 'prov-q', 'email.complained', now()), 'applied', 'a complaint wins over delivered');
select is((select status::text from public.messages where id = 'b0000002-0000-0000-0000-000000000000'), 'complained', 'status becomes complained');
select is((select delivery_problem from public.households where id = '00000012-0000-0000-0000-000000000000'), true, 'a complaint sets the delivery problem flag');

-- R: failed is terminal but is not a delivery problem; the bare event name works too.
select is(public.record_message_event('evt-r1', 'prov-r', 'failed', now()), 'applied', 'a failed event is applied (bare name)');
select is((select status::text from public.messages where id = 'b0000003-0000-0000-0000-000000000000'), 'failed', 'status becomes failed');
select is((select delivery_problem from public.households where id = '00000013-0000-0000-0000-000000000000'), false, 'a failure does not set the delivery problem flag');

-- S: the address changed after the message went out, so a bounce is about the old address.
select is(public.record_message_event('evt-s1', 'prov-s', 'email.bounced', now()), 'applied', 'a bounce for the old address is recorded');
select is((select status::text from public.messages where id = 'b0000004-0000-0000-0000-000000000000'), 'bounced', 'the message is bounced');
select is((select delivery_problem from public.households where id = '00000014-0000-0000-0000-000000000000'), false, 'a bounce for an address no longer in use sets no flag');

-- Everything else.
select is(public.record_message_event('evt-u1', 'prov-unknown', 'email.delivered', now()), 'unknown_message', 'an unknown provider message id is accepted and ignored');
select is((select count(*) from public.message_events where provider_event_id = 'evt-u1'), 0::bigint, 'an unknown message leaves no event row');
select is(public.record_message_event('evt-o1', 'prov-q', 'email.opened', now()), 'ignored', 'an unhandled event type is ignored');
select is((select count(*) from public.message_events where provider_event_id = 'evt-o1'), 0::bigint, 'an unhandled event type leaves no event row');
select is(public.record_message_event('evt-k1', 'prov-skipped', 'email.delivered', now()), 'ignored', 'events never change a skipped message');
select is((select count(*) from public.message_events where message_id = 'b0000001-0000-0000-0000-000000000000'), 6::bigint, 'every event for a known message is kept once, including ignored ones');
select throws_ok(
  $$select public.record_message_event('', 'prov-p', 'email.sent', now())$$,
  'P0001', 'invalid_payload', 'an empty event id is invalid_payload'
);

-- Due campaigns.
select tests.clear_auth();
insert into public.campaigns (id, message_type_key, name, audience, status, scheduled_for) values
  ('c0000010-0000-0000-0000-000000000000', 'invitation', 'Due late', '{"scope":"all"}', 'scheduled', now() - interval '1 hour'),
  ('c0000011-0000-0000-0000-000000000000', 'invitation', 'Due early', '{"scope":"all"}', 'scheduled', now() - interval '2 hours'),
  ('c0000012-0000-0000-0000-000000000000', 'invitation', 'Future', '{"scope":"all"}', 'scheduled', now() + interval '2 hours'),
  ('c0000013-0000-0000-0000-000000000000', 'invitation', 'Draft', '{"scope":"all"}', 'draft', null);
select tests.authenticate_service_role();
select results_eq(
  $$select id::text from public.due_scheduled_campaigns()$$,
  $$values ('c0000011-0000-0000-0000-000000000000'::text), ('c0000010-0000-0000-0000-000000000000')$$,
  'only scheduled campaigns whose time has come are due, earliest first'
);
select tests.clear_auth();

-- Changing an address clears its delivery problem (and the household's).
update public.household_contacts set delivery_problem = true where household_id in ('0000000a-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000');
update public.households set display_name = 'Household A renamed' where id = '0000000a-0000-0000-0000-000000000000';
select is((select delivery_problem from public.households where id = '0000000a-0000-0000-0000-000000000000'), true, 'editing other fields keeps the delivery problem');
update public.household_contacts set value = 'a-new@example.test' where household_id = '0000000a-0000-0000-0000-000000000000';
select is((select delivery_problem from public.households where id = '0000000a-0000-0000-0000-000000000000'), false, 'a plain update of the address clears the delivery problem');
update public.household_contacts set value = 'B-NEW@example.test' where household_id = '0000000b-0000-0000-0000-000000000000';
select is((select delivery_problem from public.households where id = '0000000b-0000-0000-0000-000000000000'), true, 'a change of letter case only is not a new address');
delete from public.household_contacts where household_id = '0000000c-0000-0000-0000-000000000000';
select is((select delivery_problem from public.households where id = '0000000c-0000-0000-0000-000000000000'), false, 'removing the address clears the delivery problem');

select * from finish();
rollback;
