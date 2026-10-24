-- Messaging tables: staff-only access, uniqueness, campaign status changes,
-- the audience check, and what happens to messages when a household is deleted.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(60);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'), (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', null);
insert into public.message_types (key, label, is_essential, template_key) values
  ('invitation', 'Invitation', true, 'invitation'),
  ('rsvp_reminder', 'RSVP reminder', false, 'rsvp_reminder');

insert into public.campaigns (id, message_type_key, name, audience, status, scheduled_for) values
  ('cccccccc-0000-0000-0000-000000000001', 'invitation', 'Draft one', '{"scope":"all"}', 'draft', null),
  ('cccccccc-0000-0000-0000-000000000002', 'rsvp_reminder', 'Sending one', '{"scope":"all"}', 'sending', now());
insert into public.messages (id, campaign_id, household_id, status, to_email) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'sent', 'a@example.test'),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', 'sent', 'b@example.test');
insert into public.message_events (provider_event_id, message_id, type, occurred_at) values
  ('evt-1', 'dddddddd-0000-0000-0000-000000000001', 'email.sent', now());

-- Row-level security is on, and the tables are named in the staff-only list.
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.message_types'::regclass, 'public.campaigns'::regclass,
                  'public.messages'::regclass, 'public.message_events'::regclass)),
  'row-level security is enabled on all four messaging tables'
);

-- Anonymous visitors: nothing.
select tests.authenticate_anon();
select throws_ok('select * from public.message_types', '42501', null, 'anon cannot read message_types');
select throws_ok('select * from public.campaigns', '42501', null, 'anon cannot read campaigns');
select throws_ok('select * from public.messages', '42501', null, 'anon cannot read messages');
select throws_ok('select * from public.message_events', '42501', null, 'anon cannot read message_events');
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"all"}')$$,
  '42501', null, 'anon cannot insert a campaign'
);
select tests.clear_auth();

-- Guests: nothing, and no writes.
select tests.authenticate_as(:'user_a');
select is_empty('select * from public.message_types', 'a guest reads no message types');
select is_empty('select * from public.campaigns', 'a guest reads no campaigns');
select is_empty('select * from public.messages', 'a guest reads no messages');
select is_empty('select * from public.message_events', 'a guest reads no message events');
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"all"}')$$,
  '42501', null, 'a guest cannot insert a campaign'
);
select is_empty($$with u as (update public.campaigns set name = 'Hacked' returning 1) select * from u$$, 'a guest cannot update campaigns');
select throws_ok(
  $$insert into public.messages (campaign_id, household_id) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  '42501', null, 'a guest cannot insert a message'
);
select tests.clear_auth();

-- Staff: read everything, write campaigns only.
select tests.authenticate_as(:'couple_user');
select is((select count(*) from public.message_types), 2::bigint, 'staff read message types');
select is((select count(*) from public.campaigns), 2::bigint, 'staff read campaigns');
select is((select count(*) from public.messages), 2::bigint, 'staff read messages');
select is((select count(*) from public.message_events), 1::bigint, 'staff read message events');
select throws_ok(
  $$insert into public.messages (campaign_id, household_id) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  '42501', null, 'staff cannot write messages directly'
);
select throws_ok(
  $$insert into public.message_events (provider_event_id, message_id, type, occurred_at) values ('evt-x', 'dddddddd-0000-0000-0000-000000000001', 'email.sent', now())$$,
  '42501', null, 'staff cannot write message events directly'
);
select throws_ok(
  $$update public.message_types set is_essential = false$$,
  '42501', null, 'staff cannot edit message types'
);
select lives_ok(
  $$insert into public.campaigns (id, message_type_key, name, audience)
    values ('cccccccc-0000-0000-0000-000000000003', 'rsvp_reminder', 'Staff draft', '{"scope":"filter","filters":{"required_events_unanswered":true}}')$$,
  'staff create a campaign'
);
select is(
  (select created_by from public.campaigns where id = 'cccccccc-0000-0000-0000-000000000003'),
  :'couple_user'::uuid,
  'the campaign records who created it'
);
select throws_ok(
  $$update public.campaigns set last_error_code = 'x' where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  '42501', null, 'staff cannot write the send-progress columns'
);
select is(
  (select actor_kind from public.audit_log where entity = 'campaigns' and action = 'insert' order by id desc limit 1),
  'couple', 'creating a campaign is audited with the staff role'
);
select tests.clear_auth();

-- The planner has the same access to campaigns.
select tests.authenticate_as(:'planner_user');
select lives_ok(
  $$update public.campaigns set name = 'Renamed by planner' where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  'the planner edits a draft campaign'
);
select tests.clear_auth();

-- Uniqueness.
select throws_ok(
  $$insert into public.messages (campaign_id, household_id) values ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  '23505', null, 'one message per household per campaign'
);
select lives_ok(
  $$insert into public.messages (campaign_id, household_id) values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  'the same household can have a message in another campaign'
);
select throws_ok(
  $$insert into public.message_events (provider_event_id, message_id, type, occurred_at) values ('evt-1', 'dddddddd-0000-0000-0000-000000000002', 'email.sent', now())$$,
  '23505', null, 'a provider event id is recorded once'
);
update public.messages set provider_message_id = 'prov-1' where id = 'dddddddd-0000-0000-0000-000000000001';
select throws_ok(
  $$update public.messages set provider_message_id = 'prov-1' where id = 'dddddddd-0000-0000-0000-000000000002'$$,
  '23505', null, 'a provider message id belongs to one message'
);
select throws_ok(
  $$update public.messages set skip_reason = 'whatever' where id = 'dddddddd-0000-0000-0000-000000000002'$$,
  '23514', null, 'an unknown skip reason is refused'
);

-- Campaign status changes. The test runner acts as the system here.
insert into public.campaigns (id, message_type_key, name, audience) values
  ('cccccccc-0000-0000-0000-000000000010', 'invitation', 'Flow', '{"scope":"all"}');
select throws_ok(
  $$update public.campaigns set status = 'scheduled' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  '23514', null, 'a scheduled campaign needs a send time'
);
select lives_ok(
  $$update public.campaigns set status = 'scheduled', scheduled_for = now() + interval '1 day' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'draft to scheduled'
);
select lives_ok(
  $$update public.campaigns set name = 'Flow renamed', scheduled_for = now() + interval '2 days' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'a scheduled campaign can still be edited'
);
select throws_ok(
  $$update public.campaigns set status = 'done' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'P0001', 'invalid_status_transition', 'scheduled cannot jump to done'
);
select lives_ok(
  $$update public.campaigns set status = 'sending', started_at = now() where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'scheduled to sending'
);
select throws_ok(
  $$update public.campaigns set name = 'Too late' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'P0001', 'campaign_locked', 'a sending campaign cannot be edited'
);
select throws_ok(
  $$update public.campaigns set audience = '{"scope":"filter","filters":{"delivery_problem":true}}', status = 'sending' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'P0001', 'campaign_locked', 'a sending campaign keeps its audience'
);
select lives_ok(
  $$update public.campaigns set last_error_code = 'oops' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'the send-progress columns can still be written while sending'
);
select throws_ok(
  $$update public.campaigns set status = 'cancelled' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'P0001', 'invalid_status_transition', 'a sending campaign cannot be cancelled'
);
select lives_ok(
  $$update public.campaigns set status = 'done', completed_at = now() where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'sending to done'
);
select throws_ok(
  $$update public.campaigns set status = 'sending' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'P0001', 'invalid_status_transition', 'done is final'
);
select throws_ok(
  $$update public.campaigns set name = 'Again' where id = 'cccccccc-0000-0000-0000-000000000010'$$,
  'P0001', 'campaign_locked', 'a done campaign cannot be edited'
);
select lives_ok(
  $$update public.campaigns set status = 'cancelled' where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'draft to cancelled'
);
select throws_ok(
  $$update public.campaigns set status = 'draft' where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'P0001', 'invalid_status_transition', 'cancelled is final'
);

-- Staff may only schedule or cancel; sending and done belong to the sender.
select tests.authenticate_as(:'couple_user');
select lives_ok(
  $$update public.campaigns set status = 'scheduled', scheduled_for = now() + interval '1 day' where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  'staff schedule a draft'
);
select throws_ok(
  $$update public.campaigns set status = 'sending' where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  'P0001', 'invalid_status_transition', 'staff cannot mark a campaign as sending'
);
select lives_ok(
  $$update public.campaigns set status = 'cancelled' where id = 'cccccccc-0000-0000-0000-000000000003'$$,
  'staff cancel a scheduled campaign'
);
select tests.clear_auth();

-- The audience check.
insert into public.campaigns (id, message_type_key, name, audience) values
  ('cccccccc-0000-0000-0000-000000000020', 'invitation', 'Audience edits', '{"scope":"all"}');
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"everyone"}')$$,
  '23514', null, 'an unknown scope is rejected'
);
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"all","filters":{"delivery_problem":true}}')$$,
  '23514', null, 'scope all takes no filters'
);
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"household"}')$$,
  '23514', null, 'scope household needs a household id'
);
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"household","household_id":"not-a-uuid"}')$$,
  '23514', null, 'the household id must be a uuid'
);
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"filter","filters":{"favourite_colour":"red"}}')$$,
  '23514', null, 'an unknown filter key is rejected'
);
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"filter","filters":{}}')$$,
  '23514', null, 'a filter audience needs at least one filter'
);
select throws_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"filter","filters":{"meals_not_chosen":false}}')$$,
  '23514', null, 'true/false filters accept only true'
);
select throws_ok(
  $$update public.campaigns set audience = '{"scope":"filter","extra":1,"filters":{"delivery_problem":true}}' where id = 'cccccccc-0000-0000-0000-000000000020'$$,
  '23514', null, 'an update to an invalid audience is rejected'
);
select lives_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"all"}')$$,
  'scope all is accepted'
);
select lives_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X', '{"scope":"household","household_id":"aaaaaaaa-0000-0000-0000-00000000000a"}')$$,
  'scope household with an id is accepted'
);
select lives_ok(
  $$insert into public.campaigns (message_type_key, name, audience) values ('invitation', 'X',
    '{"scope":"filter","filters":{"invited_to_event":"welcome-party","required_events_unanswered":true,"optional_event_unanswered":"rehearsal","meals_not_chosen":true,"not_yet_sent_message_type":"invitation","delivery_problem":true}}')$$,
  'a filter audience with every filter is accepted'
);

-- Deleting a household keeps the message but forgets who and where.
delete from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select results_eq(
  $$select household_id::text, to_email::text from public.messages where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  $$values (null::text, null::text)$$,
  'deleting a household nulls the message household and address'
);
select is(
  (select to_email::text from public.messages where id = 'dddddddd-0000-0000-0000-000000000002'), 'b@example.test',
  'other households'' messages keep their address'
);

select * from finish();
rollback;
