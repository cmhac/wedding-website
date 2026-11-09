-- Personal invite links: the version columns on households, the wedding event
-- setting, and invite_links_open() (links close on the wedding event's date in
-- America/Los_Angeles). Fake data only.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(26);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('household-a@households.invalid') as user_a \gset

insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');
insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a');
-- The wedding starts on 12 June 2027 at 14:00 UTC (7:00 in Los Angeles).
insert into public.events (id, slug, name, is_required, starts_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'ceremony', 'Ceremony', true, '2027-06-12T14:00:00Z');

-- Columns on households.
select col_not_null('public', 'households', 'invite_link_version', 'invite_link_version is not null');
select col_default_is('public', 'households', 'invite_link_version', '1', 'invite_link_version starts at 1');
select col_not_null('public', 'households', 'invite_link_issued_at', 'invite_link_issued_at is not null');
select is(
  (select invite_link_version from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  1, 'a new household is on link version 1'
);
select ok(
  not has_column_privilege('authenticated', 'public.households', 'invite_link_version', 'SELECT'),
  'a signed-in user cannot read the link version'
);
select ok(
  not has_column_privilege('authenticated', 'public.households', 'invite_link_issued_at', 'SELECT'),
  'or when it was issued'
);
select ok(
  not has_column_privilege('authenticated', 'public.households', 'invite_link_version', 'UPDATE'),
  'and cannot change the version directly'
);

-- The wedding event setting.
select col_is_null('public', 'settings', 'wedding_event_id', 'no wedding event is chosen at first');
update public.settings set wedding_event_id = 'eeeeeeee-0000-0000-0000-000000000001';
select is(
  (select wedding_event_id from public.settings), 'eeeeeeee-0000-0000-0000-000000000001'::uuid,
  'a wedding event can be chosen'
);

-- invite_links_open(): closes on the event's date in Los Angeles.
select is(public.invite_links_open('2027-06-01T12:00:00Z'), true, 'open well before the wedding');
select is(
  public.invite_links_open('2027-06-12T06:59:00Z'), true,
  'open until midnight Pacific the night before (23:59 Pacific, 06:59 UTC)'
);
select is(
  public.invite_links_open('2027-06-12T07:00:00Z'), false,
  'closed from midnight Pacific on the wedding day'
);
select is(public.invite_links_open('2027-06-12T20:00:00Z'), false, 'closed on the wedding day');
select is(public.invite_links_open('2027-06-20T12:00:00Z'), false, 'closed after the wedding');
select is(
  public.invite_links_open('2027-06-12T02:00:00Z'), true,
  'still open at 19:00 Pacific the evening before, although UTC is already the wedding date'
);

-- An event late in the evening Pacific is on that Pacific date, not the UTC one.
update public.events set starts_at = '2027-06-13T03:30:00Z';
select is(
  public.invite_links_open('2027-06-12T08:00:00Z'), false,
  'an event at 20:30 Pacific on 12 June closes links from midnight Pacific that day'
);

-- No wedding event chosen: open.
update public.settings set wedding_event_id = null;
select is(public.invite_links_open('2030-01-01T00:00:00Z'), true, 'open when no wedding event is chosen');

-- Deleting the chosen event unsets it.
update public.settings set wedding_event_id = 'eeeeeeee-0000-0000-0000-000000000001';
delete from public.events where id = 'eeeeeeee-0000-0000-0000-000000000001';
select is((select wedding_event_id from public.settings), null, 'deleting the wedding event unsets the setting');

-- Only the service role can ask.
select ok(
  has_function_privilege('service_role', 'public.invite_links_open(timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.invite_links_open(timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.invite_links_open(timestamptz)', 'EXECUTE'),
  'only the service role can execute invite_links_open'
);

-- reissue_invite_link: staff only, audited, supersedes the old link.
select tests.create_user('planner@example.test') as planner_user \gset
insert into public.staff (user_id, role, display_name) values (:'planner_user', 'planner', 'Planner');
update public.households set invite_link_issued_at = '2020-01-01T00:00:00Z';

select tests.authenticate_as(:'couple_user');
select is(public.reissue_invite_link('aaaaaaaa-0000-0000-0000-00000000000a'), 2, 'the couple can reissue: the version becomes 2');
select tests.clear_auth();
select tests.authenticate_as(:'planner_user');
select is(public.reissue_invite_link('aaaaaaaa-0000-0000-0000-00000000000a'), 3, 'the planner can too: the version becomes 3');
select tests.clear_auth();
select ok(
  (select invite_link_issued_at > '2020-01-01T00:00:00Z' from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  'reissuing sets when the link was issued'
);
select ok(
  exists (
    select 1 from public.audit_log
     where entity = 'households' and entity_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
       and action = 'update' and 'invite_link_version' = any (changed_fields)
       and actor_kind = 'planner'
  ),
  'it is audited (the column name, attributed to the actor)'
);

select tests.authenticate_as(:'user_a');
select throws_ok($$select public.reissue_invite_link('aaaaaaaa-0000-0000-0000-00000000000a')$$, 'P0001', 'forbidden', 'a guest cannot reissue');
select tests.clear_auth();
select tests.authenticate_as(:'couple_user');
select throws_ok($$select public.reissue_invite_link('99999999-0000-0000-0000-000000000009')$$, 'P0001', 'not_found', 'an unknown household is not_found');
select tests.clear_auth();
select ok(
  not has_function_privilege('anon', 'public.reissue_invite_link(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reissue_invite_link(uuid)', 'EXECUTE'),
  'anon cannot execute it; signed-in users reach its own staff check'
);

select * from finish();
rollback;
