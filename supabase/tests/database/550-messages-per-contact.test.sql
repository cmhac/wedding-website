-- Messages per address: messages.contact_id (not a foreign key: see the
-- migration), one row per campaign, household and address (a skipped household has one row with no address), and claiming
-- re-reads the address. Enqueueing itself is done by the site (dispatch.ts) and
-- tested there.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(20);

insert into public.message_types (key, label, is_essential, template_key) values
  ('invitation', 'Invitation', true, 'invitation');
insert into public.households (id, display_name) values
  ('0000000a-0000-0000-0000-000000000000', 'Household A'),
  ('0000000b-0000-0000-0000-000000000000', 'Household B');
insert into public.household_contacts (id, household_id, kind, value, created_at) values
  ('c000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000000', 'email', 'a1@example.test', '2027-01-01T00:00:01Z'),
  ('c000000a-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000000', 'email', 'a2@example.test', '2027-01-01T00:00:02Z'),
  ('c000000b-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-000000000000', 'email', 'b1@example.test', '2027-01-01T00:00:03Z');
insert into public.campaigns (id, message_type_key, name, audience, status) values
  ('c0000001-0000-0000-0000-000000000000', 'invitation', 'Invitations', '{"scope":"all"}', 'sending');

select has_column('public', 'messages', 'contact_id', 'messages has contact_id');
select col_is_null('public', 'messages', 'contact_id', 'contact_id may be null (a skipped household row)');

-- One row per address.
insert into public.messages (id, campaign_id, household_id, contact_id, status) values
  ('a0000001-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'c000000a-0000-0000-0000-000000000001', 'queued'),
  ('a0000002-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'c000000a-0000-0000-0000-000000000002', 'queued'),
  ('a0000003-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', 'c000000b-0000-0000-0000-000000000001', 'queued');
select throws_ok(
  $$insert into public.messages (campaign_id, household_id, contact_id, status)
    values ('c0000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'c000000a-0000-0000-0000-000000000001', 'queued')$$,
  '23505', null, 'the same address cannot be queued twice for a campaign'
);
select lives_ok(
  $$insert into public.messages (campaign_id, household_id, contact_id, status)
    values ('c0000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', null, 'skipped')$$,
  'a household can also have one row with no address'
);
select throws_ok(
  $$insert into public.messages (campaign_id, household_id, contact_id, status)
    values ('c0000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', null, 'skipped')$$,
  '23505', null, 'but only one: nulls count as equal'
);
select lives_ok(
  $$insert into public.messages (campaign_id, household_id, contact_id, status, skip_reason)
    select 'c0000001-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', null, 'skipped', 'no_email'$$,
  'another household has its own row with no address'
);

-- Re-running the enqueue (on conflict do nothing) adds nothing.
insert into public.messages (campaign_id, household_id, contact_id, status)
  values ('c0000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'c000000a-0000-0000-0000-000000000001', 'queued')
  on conflict (campaign_id, household_id, contact_id) do nothing;
select is(
  (select count(*)::int from public.messages where campaign_id = 'c0000001-0000-0000-0000-000000000000'),
  5, 'a repeated enqueue adds no rows'
);

-- Removing addresses never fails, even when several are removed from one household.
select lives_ok(
  $$delete from public.household_contacts where id = 'c000000a-0000-0000-0000-000000000002'$$,
  'removing an address that has a queued message works'
);
select is(
  (select count(*)::int from public.messages where id = 'a0000002-0000-0000-0000-000000000000'),
  1, 'and the message stays'
);

-- Changing an address before the claim: the claim uses the current value.
update public.household_contacts set value = 'a1-new@example.test' where id = 'c000000a-0000-0000-0000-000000000001';

select tests.authenticate_service_role();
select results_eq(
  $$select id::text, household_id::text, to_email::text
      from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10) order by id$$,
  $$values ('a0000001-0000-0000-0000-000000000000'::text, '0000000a-0000-0000-0000-000000000000'::text, 'a1-new@example.test'::text),
           ('a0000003-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', 'b1@example.test')$$,
  'claiming returns one row per remaining address, with the address as it is now'
);
select tests.clear_auth();

select results_eq(
  $$select status::text, skip_reason from public.messages where id = 'a0000002-0000-0000-0000-000000000000'$$,
  $$values ('skipped'::text, 'no_email'::text)$$,
  'a queued message whose address was removed is skipped with no_email'
);
select is(
  (select to_email::text from public.messages where id = 'a0000001-0000-0000-0000-000000000000'),
  'a1-new@example.test', 'to_email is the address''s value at claim time'
);

-- A second claim finds nothing new: each address is sent once.
select tests.authenticate_service_role();
select is(
  (select count(*)::int from public.claim_campaign_messages('c0000001-0000-0000-0000-000000000000', 10)),
  0, 'claiming again returns nothing'
);
select tests.clear_auth();

-- Deleting the household forgets the addresses on its messages.
delete from public.households where id = '0000000a-0000-0000-0000-000000000000';
select is(
  (select count(*)::int from public.messages where to_email is not null and household_id is null),
  0, 'deleting a household leaves no address on its messages'
);

-- Delivery problems are per address (record_message_event).
select tests.clear_data();
insert into public.message_types (key, label, is_essential, template_key) values
  ('invitation', 'Invitation', true, 'invitation');
insert into public.households (id, display_name) values
  ('0000000c-0000-0000-0000-000000000000', 'Household C');
insert into public.household_contacts (id, household_id, kind, value) values
  ('c000000c-0000-0000-0000-000000000001', '0000000c-0000-0000-0000-000000000000', 'email', 'c1@example.test'),
  ('c000000c-0000-0000-0000-000000000002', '0000000c-0000-0000-0000-000000000000', 'email', 'c2@example.test');
insert into public.campaigns (id, message_type_key, name, audience, status) values
  ('c0000002-0000-0000-0000-000000000000', 'invitation', 'Invitations', '{"scope":"all"}', 'sending');
insert into public.messages (id, campaign_id, household_id, contact_id, to_email, status, provider_message_id) values
  ('a0000011-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', 'c000000c-0000-0000-0000-000000000001', 'c1@example.test', 'sent', 'prov-1'),
  ('a0000012-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', 'c000000c-0000-0000-0000-000000000002', 'c2@example.test', 'sent', 'prov-2');

select tests.authenticate_service_role();
select is(public.record_message_event('evt-1', 'prov-1', 'email.bounced', now()), 'applied', 'a bounce is applied');
select tests.clear_auth();
select results_eq(
  $$select value::text, delivery_problem from public.household_contacts order by value$$,
  $$values ('c1@example.test'::text, true), ('c2@example.test', false)$$,
  'only the address that bounced is flagged'
);
select is(
  (select delivery_problem from public.households where id = '0000000c-0000-0000-0000-000000000000'),
  true, 'and so is its household'
);

-- A repeated or out-of-order event ends in the same state.
select tests.authenticate_service_role();
select is(public.record_message_event('evt-1', 'prov-1', 'email.bounced', now()), 'duplicate', 'a repeated event is a duplicate');
select is(public.record_message_event('evt-2', 'prov-1', 'email.delivered', now()), 'ignored', 'a later delivered event cannot undo the bounce');
select tests.clear_auth();

-- A complaint on the other address flags it too; correcting one clears only that one.
select tests.authenticate_service_role();
select public.record_message_event('evt-3', 'prov-2', 'email.complained', now());
select tests.clear_auth();
update public.household_contacts set value = 'c1-fixed@example.test' where id = 'c000000c-0000-0000-0000-000000000001';
select results_eq(
  $$select value::text, delivery_problem from public.household_contacts order by value$$,
  $$values ('c1-fixed@example.test'::text, false), ('c2@example.test', true)$$,
  'correcting an address clears its flag and leaves the other address flagged'
);

select * from finish();
rollback;
