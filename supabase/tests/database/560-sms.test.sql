-- Text messages: phone contacts, the opt-in record and who can set it, the
-- consent functions, the staff switch, claiming text rows and Twilio status
-- updates. Fake numbers only (the 555-01xx range).
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(55);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@households.invalid') as user_a \gset
select tests.create_user('household-b@households.invalid') as user_b \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'),
  (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', :'user_b');
insert into public.household_contacts (id, household_id, kind, value) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'a1@example.test'),
  ('cccccccc-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'phone', '+12025550123'),
  ('cccccccc-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'phone', '+12025550124');

select has_type('public', 'sms_consent_state', 'the consent state type exists');
select is(
  (select sms_consent::text from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  'not_asked', 'a new number starts not asked'
);

-- Shape, uniqueness and consent rules.
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'phone', '2025550123')$$,
  '23514', null, 'a phone value that is not E.164 is refused'
);
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'phone', '+12025550123')$$,
  '23505', null, 'a number cannot belong to two households'
);
select throws_ok(
  $$update public.household_contacts
       set sms_consent = 'opted_in', sms_consent_at = now(), sms_consent_source = 'first_sign_in'
     where id = 'eeeeeeee-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'an email address cannot hold an opt-in'
);
select throws_ok(
  $$update public.household_contacts set sms_consent = 'opted_in'
     where id = 'cccccccc-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'an opt-in must carry when and where'
);
update public.household_contacts
   set sms_consent = 'opted_in', sms_consent_at = now(), sms_consent_source = 'sign_in_prompt'
 where id = 'cccccccc-0000-0000-0000-0000000000a1';
update public.household_contacts set value = '+12025550199'
 where id = 'cccccccc-0000-0000-0000-0000000000a1';
select is(
  (select sms_consent::text from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  'not_asked', 'changing a number resets its opt-in'
);
select is(
  (select sms_consent_at from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  null::timestamptz, 'and clears when it was given'
);
update public.household_contacts set value = '+12025550123'
 where id = 'cccccccc-0000-0000-0000-0000000000a1';

-- Staff: read everything, but cannot write phone rows or opt-ins.
select tests.authenticate_as(:'couple_user');
select is(
  (select count(*)::int from public.household_contacts where kind = 'phone'), 2,
  'staff can read phone contacts'
);
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'phone', '+12025550150')$$,
  '42501', null, 'staff cannot insert a phone row directly'
);
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value, sms_consent)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'x@example.test', 'opted_in')$$,
  '42501', null, 'staff cannot insert a row that is already opted in'
);
select throws_ok(
  $$update public.household_contacts set sms_consent = 'opted_in'$$,
  '42501', null, 'staff cannot set an opt-in'
);
select lives_ok(
  $$update public.household_contacts set value = 'a1.new@example.test'
     where id = 'eeeeeeee-0000-0000-0000-0000000000a1'$$,
  'staff can still change an email address directly'
);
update public.household_contacts set value = '+12025550177'
 where id = 'cccccccc-0000-0000-0000-0000000000a1';
select tests.clear_auth();
select is(
  (select value::text from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  '+12025550123', 'a direct staff update of a phone number changes nothing'
);

-- The staff switch: any staff member can read, only the couple changes it.
select tests.authenticate_as(:'planner_user');
select throws_ok(
  $$update public.settings set sms_enabled = true$$,
  'P0001', 'forbidden', 'a planner cannot turn texting on'
);
select lives_ok(
  $$update public.settings set rsvp_open = true$$,
  'a planner can still change other settings'
);
select tests.clear_auth();
select tests.authenticate_as(:'couple_user');
select lives_ok($$update public.settings set sms_enabled = true$$, 'the couple can turn texting on');
update public.settings set sms_enabled = false;
select tests.clear_auth();
select is((select sms_enabled from public.settings), false, 'texting is off by default');

-- Guest: sees own contacts with the consent state; answers only for own numbers.
select tests.authenticate_as(:'user_a');
select is(
  (select e ->> 'consent' from jsonb_array_elements(public.get_my_contacts()) e where e ->> 'kind' = 'phone'),
  'not_asked', 'a guest sees the opt-in state of their own number'
);
select is(
  public.record_sms_consent('[{"contact_id": "cccccccc-0000-0000-0000-0000000000b1", "opt_in": true}]'::jsonb),
  '[]'::jsonb, 'a guest cannot answer for another household''s number'
);
select throws_ok(
  $$select public.record_sms_consent('[]'::jsonb)$$,
  'P0001', 'invalid_payload', 'an empty answer is refused'
);
select is(
  public.record_sms_consent('[{"contact_id": "eeeeeeee-0000-0000-0000-0000000000a1", "opt_in": true}]'::jsonb),
  '[]'::jsonb, 'an email contact cannot be opted in'
);
select is(
  public.record_sms_consent('[{"contact_id": "cccccccc-0000-0000-0000-0000000000a1", "opt_in": true}]'::jsonb),
  '["cccccccc-0000-0000-0000-0000000000a1"]'::jsonb, 'ticking the box opts the number in and reports it'
);
select is(
  public.record_sms_consent('[{"contact_id": "cccccccc-0000-0000-0000-0000000000a1", "opt_in": true}]'::jsonb),
  '[]'::jsonb, 'answering again changes nothing and reports nothing'
);
select tests.clear_auth();
select is(
  (select sms_consent_source from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  'first_sign_in', 'the answer records where it was given'
);
select is(
  (select sms_consent::text from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000b1'),
  'not_asked', 'another household''s number was untouched'
);
select tests.authenticate_as(:'user_b');
select is(
  public.record_sms_consent('[{"contact_id": "cccccccc-0000-0000-0000-0000000000b1", "opt_in": false}]'::jsonb),
  '[]'::jsonb, 'declining reports nothing to confirm'
);
select tests.clear_auth();
select is(
  (select sms_consent::text from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000b1'),
  'declined', 'and records declined'
);

-- Service role: look up, record by number, manage phones.
select tests.authenticate_service_role();
select is(
  public.find_phone_contact('+12025550124') ->> 'household_id',
  'bbbbbbbb-0000-0000-0000-00000000000b', 'a number finds its household'
);
select is(public.find_phone_contact('+12025550100'), null::jsonb, 'an unknown number finds nothing');
select is(
  (public.record_sms_consent_for_number('bbbbbbbb-0000-0000-0000-00000000000b', '+12025550124') ->> 'newly_opted_in')::boolean,
  true, 'a ticked box on the prompt opts in a declined number'
);
select is(
  (public.record_sms_consent_for_number('bbbbbbbb-0000-0000-0000-00000000000b', '+12025550124') ->> 'newly_opted_in')::boolean,
  false, 'and a second tick is not new'
);
select is(
  public.record_sms_consent_for_number('aaaaaaaa-0000-0000-0000-00000000000a', '+12025550124') ->> 'found',
  'false', 'a number of another household is not found'
);
select lives_ok(
  $$select public.add_phone_contact('aaaaaaaa-0000-0000-0000-00000000000a', '+12025550131')$$,
  'the service role can add a phone'
);
select throws_ok(
  $$select public.add_phone_contact('aaaaaaaa-0000-0000-0000-00000000000a', '+12025550131')$$,
  'P0001', 'phone_in_use', 'a repeated number is refused'
);
select throws_ok(
  $$select public.add_phone_contact('aaaaaaaa-0000-0000-0000-00000000000a', '12025550132')$$,
  'P0001', 'invalid_payload', 'a value that is not E.164 is refused'
);
select tests.clear_auth();
select ok(
  not has_function_privilege('authenticated', 'public.find_phone_contact(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.add_phone_contact(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_sms_consent_for_number(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.record_sms_consent(jsonb)', 'execute'),
  'only the guest consent function is open to signed-in users'
);

-- Claiming text rows and recording Twilio statuses.
insert into public.message_types (key, label, is_essential, template_key) values
  ('rsvp_reminder', 'RSVP reminder', false, 'rsvp_reminder')
  on conflict (key) do nothing;
insert into public.campaigns (id, message_type_key, name, audience, status, channel) values
  ('c0000001-0000-0000-0000-000000000000', 'rsvp_reminder', 'Reminders', '{"scope":"all"}', 'sending', 'text');
insert into public.messages (id, campaign_id, household_id, contact_id, channel, status) values
  ('a0000001-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-0000000000a1', 'text', 'queued'),
  ('a0000002-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000a', gen_random_uuid(), 'text', 'queued');
insert into public.household_contacts (id, household_id, kind, value) values
  ('cccccccc-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'phone', '+12025550141');
insert into public.messages (id, campaign_id, household_id, contact_id, channel, status) values
  ('a0000003-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-0000000000a2', 'text', 'queued');

select tests.authenticate_service_role();
select is(
  (select array_agg(to_phone) from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10)),
  array['+12025550123'], 'only the opted-in number is claimed, with its number'
);
select tests.clear_auth();
select is(
  (select skip_reason from public.messages where id = 'a0000002-0000-0000-0000-000000000000'),
  'no_phone', 'a removed number is skipped no_phone'
);
select is(
  (select skip_reason from public.messages where id = 'a0000003-0000-0000-0000-000000000000'),
  'not_opted_in', 'a number that has not opted in is skipped'
);
select is(
  (select channel::text from public.messages where id = 'a0000001-0000-0000-0000-000000000000'),
  'text', 'the row is a text'
);

update public.messages set provider_message_id = 'SM1' where id = 'a0000001-0000-0000-0000-000000000000';
select tests.authenticate_service_role();
select is(public.record_text_status('ev1', 'SM1', 'sent', null, now()), 'applied', 'sent is applied');
select is(public.record_text_status('ev1', 'SM1', 'sent', null, now()), 'duplicate', 'a repeat is a no-op');
select is(public.record_text_status('ev2', 'SM1', 'delivered', null, now()), 'applied', 'delivered moves forward');
select is(public.record_text_status('ev3', 'SM1', 'sending', null, now()), 'ignored', 'an earlier status never moves it back');
select is(public.record_text_status('ev4', 'SM1', 'failed', '30006', now()), 'applied', 'a failure is applied');
select is(public.record_text_status('ev5', 'SMX', 'sent', null, now()), 'unknown_message', 'an unknown message is ignored');
select tests.clear_auth();
select is(
  (select error_code from public.messages where id = 'a0000001-0000-0000-0000-000000000000'),
  '30006', 'the error code is kept'
);
select is(
  (select delivery_problem from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  true, 'a failed text flags the number'
);
select is(
  (select delivery_problem from public.household_contacts where id = 'cccccccc-0000-0000-0000-0000000000a2'),
  false, 'and not the household''s other number'
);

-- A text claimed 20 minutes ago with no confirmation is failed, never re-queued.
insert into public.messages (id, campaign_id, household_id, contact_id, channel, status, claimed_at)
  values ('a0000004-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000',
          'bbbbbbbb-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-0000000000b1',
          'text', 'sending', now() - interval '20 minutes');
select tests.authenticate_service_role();
select is((select count(*)::int from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10)), 0, 'a stale text is not claimed again');
select tests.clear_auth();
select is(
  (select error_code from public.messages where id = 'a0000004-0000-0000-0000-000000000000'),
  'unknown_outcome', 'a stale text claim becomes unknown_outcome'
);

-- A campaign's channel is locked once it is sending.
select throws_ok(
  $$update public.campaigns set channel = 'both' where id = 'c0000001-0000-0000-0000-000000000000'$$,
  'P0001', 'campaign_locked', 'the channel cannot change once sending'
);

-- Deleting a household forgets the number used.
update public.messages set to_phone = '+12025550123' where id = 'a0000001-0000-0000-0000-000000000000';
delete from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select is(
  (select to_phone from public.messages where id = 'a0000001-0000-0000-0000-000000000000'),
  null::text, 'deleting a household forgets the number a message used'
);
select is(
  (select count(*)::int from public.household_contacts where household_id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  0, 'and removes its numbers with their opt-ins'
);

select * from finish();
rollback;
