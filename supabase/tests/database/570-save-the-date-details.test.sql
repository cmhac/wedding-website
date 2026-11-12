
-- Save the date details, first opened and test campaigns
-- (specs/006-save-the-date-outreach). Fake data only.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select * from no_plan();

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('household-a@households.invalid') as user_a \gset
select tests.create_user('household-b@households.invalid') as user_b \gset

insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');
insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', :'user_b');
-- 2027-09-18 00:30 UTC is still the 17th in Los Angeles: the date follows the couple's time zone.
insert into public.events (id, slug, name, starts_at, is_required) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'wedding', 'Wedding', '2027-09-18 19:30:00+00', true);

-- Details and revision.
select is((select save_the_date_revision from public.settings), 1, 'the revision starts at 1');
select tests.authenticate_as(:'couple_user');
select lives_ok(
  $$update public.settings set save_the_date_place = 'Napa Valley, California', save_the_date_note = 'Invitation to follow'$$,
  'staff can set the place and the note'
);
select tests.clear_auth();
select is((select save_the_date_revision from public.settings), 2, 'changing the place or note raises the revision');
update public.settings set couple_names = 'Chris & Hannah';
select is((select save_the_date_revision from public.settings), 2, 'changing something else does not');
update public.settings set wedding_event_id = 'eeeeeeee-0000-0000-0000-000000000001';
select is((select save_the_date_revision from public.settings), 3, 'changing the wedding event raises it');
update public.events set starts_at = '2027-09-19 19:30:00+00' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select is((select save_the_date_revision from public.settings), 4, 'moving the wedding event''s own date raises it too');
update public.events set name = 'Wedding day' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select is((select save_the_date_revision from public.settings), 4, 'but renaming the event does not');
update public.events set starts_at = '2027-09-18 19:30:00+00' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select throws_ok(
  $$update public.settings set save_the_date_place = repeat('x', 201)$$,
  '23514', null, 'a place line over 200 characters is refused'
);

-- get_save_the_date.
select tests.authenticate_as(:'user_a');
select is(
  public.get_save_the_date() ->> 'date', '2027-09-18',
  'a guest gets the wedding date as a calendar date in the couple''s time zone'
);
select is(public.get_save_the_date() ->> 'place', 'Napa Valley, California', 'and the place line');
select is((public.get_save_the_date() ->> 'revision')::int, 5, 'and the revision');
select tests.clear_auth();
select tests.authenticate_as(:'couple_user');
select is(public.get_save_the_date() ->> 'couple_names', 'Chris & Hannah', 'staff can read it too');
select tests.clear_auth();
select tests.authenticate_service_role();
select is(public.get_save_the_date() ->> 'date', '2027-09-18', 'the sender (service role) can read it too');
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok($$select public.get_save_the_date()$$, '42501', null, 'a visitor who is not signed in cannot');
select tests.clear_auth();
update public.settings set wedding_event_id = null;
select tests.authenticate_as(:'user_a');
select is(public.get_save_the_date() -> 'date', 'null'::jsonb, 'with no wedding event the date is null');
select tests.clear_auth();

-- First opened.
select is((select first_opened_at from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), null::timestamptz, 'a household starts unopened');
select tests.authenticate_as(:'user_a');
select lives_ok($$select public.record_household_opened()$$, 'a guest can record that they opened the site');
select tests.clear_auth();
select isnt((select first_opened_at from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), null::timestamptz, 'it sets their household');
select is((select first_opened_at from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b'), null::timestamptz, 'and no other household');
update public.households set first_opened_at = '2026-01-01 00:00:00+00' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.authenticate_as(:'user_a');
select public.record_household_opened();
select tests.clear_auth();
select is((select first_opened_at from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), '2026-01-01 00:00:00+00'::timestamptz, 'it is set once and never changes again');

-- Test campaigns.
insert into public.message_types (key, label, is_essential, template_key) values
  ('save_the_date', 'Save the date', true, 'save_the_date');
insert into public.campaigns (id, message_type_key, name, audience, status, started_at)
  values ('cccccccc-0000-0000-0000-000000000001', 'save_the_date', 'Test', '{"scope":"all"}', 'sending', now());
select is((select is_test from public.campaigns where id = 'cccccccc-0000-0000-0000-000000000001'), false, 'a campaign is not a test by default');
select throws_ok(
  $$update public.campaigns set is_test = true where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'P0001', 'campaign_locked', 'a sending campaign cannot become a test'
);

select * from finish();
rollback;
