
-- The "has not opened the site" audience filter and test campaigns
-- (specs/006-save-the-date-outreach). Fake data only.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select * from no_plan();

select tests.create_user('couple@example.test') as couple_user \gset

insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');
insert into public.households (id, display_name, first_opened_at) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', null);
insert into public.household_contacts (household_id, kind, value) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'b@example.test');

select ok(public.is_valid_audience('{"scope":"filter","filters":{"not_opened":true}}'::jsonb), 'not_opened is a valid filter');
select ok(not public.is_valid_audience('{"scope":"filter","filters":{"not_opened":false}}'::jsonb), 'but only with true');
select ok(not public.is_valid_audience('{"scope":"filter","filters":{"not_opened":"yes"}}'::jsonb), 'and not as text');

select tests.authenticate_as(:'couple_user');
select is(
  (select array_agg(display_name order by display_name)
     from public.resolve_audience('{"scope":"filter","filters":{"not_opened":true}}'::jsonb)),
  array['Household B'], 'only households that have not opened the site match'
);
select tests.clear_auth();

-- Test campaigns do not count as the real send.
insert into public.campaigns (id, message_type_key, name, audience, status, is_test)
  values ('cccccccc-0000-0000-0000-000000000001', 'save_the_date', 'Test', '{"scope":"household","household_id":"bbbbbbbb-0000-0000-0000-00000000000b"}', 'done', true);
insert into public.messages (campaign_id, household_id, to_email, status)
  values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'b@example.test', 'sent');
select tests.authenticate_as(:'couple_user');
select is(
  (select count(*)::int from public.resolve_audience('{"scope":"filter","filters":{"not_yet_sent_message_type":"save_the_date"}}'::jsonb)),
  2, 'a household sent only a test still counts as not yet sent'
);
select tests.clear_auth();

update public.campaigns set is_test = false where id = 'cccccccc-0000-0000-0000-000000000001';
select tests.authenticate_as(:'couple_user');
select is(
  (select array_agg(display_name) from public.resolve_audience('{"scope":"filter","filters":{"not_yet_sent_message_type":"save_the_date"}}'::jsonb)),
  array['Household A'], 'the same send as a real campaign does count'
);
select is(
  (select count(*)::int from public.resolve_audience('{"scope":"filter","filters":{"not_opened":true,"not_yet_sent_message_type":"save_the_date"}}'::jsonb)),
  0, 'the new filter combines with the existing ones'
);
select tests.clear_auth();

select * from finish();
rollback;
