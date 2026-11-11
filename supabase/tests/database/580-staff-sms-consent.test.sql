
-- Staff-marked consent (specs/006-save-the-date-outreach). Fake numbers only
-- (the 555-01xx range).
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select * from no_plan();

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('planner@example.test') as planner_user \gset
select tests.create_user('household-a@households.invalid') as user_a \gset

insert into public.staff (user_id, role, display_name) values
  (:'couple_user', 'couple', 'Couple'),
  (:'planner_user', 'planner', 'Planner');
insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', null),
  ('cccccccc-0000-0000-0000-00000000000c', 'Household C', null);
insert into public.household_contacts (id, household_id, kind, value) values
  ('11111111-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'phone', '+12025550101'),
  ('11111111-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'phone', '+12025550102'),
  ('11111111-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'phone', '+12025550103');
-- Household C has no phone number. One number of A has declined at the site.
update public.household_contacts
   set sms_consent = 'declined', sms_consent_at = now(), sms_consent_source = 'first_sign_in'
 where id = '11111111-0000-0000-0000-0000000000a2';

-- Who may call it.
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[])$$,
  'P0001', 'forbidden', 'a guest cannot mark consent'
);
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok(
  $$select public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[])$$,
  '42501', null, 'a visitor who is not signed in cannot'
);
select tests.clear_auth();

-- A dry run counts and changes nothing.
select tests.authenticate_as(:'planner_user');
select is(
  public.staff_set_sms_consent(
    array['aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c']::uuid[],
    null, 'mark', false, null, true
  ),
  '{"marked": 2, "cleared": 0, "already": 0, "declined_skipped": 1, "households_without_phone": 1, "households": 3, "dry_run": true}'::jsonb,
  'a dry run reports the counts, skipping the declined number'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.household_contacts where sms_consent = 'opted_in'), 0,
  'and changes nothing'
);

-- A batch, by the planner.
select tests.authenticate_as(:'planner_user');
select is(
  (public.staff_set_sms_consent(
    array['aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000c']::uuid[],
    null, 'mark', false, 'address form, October'
  ) ->> 'marked')::int,
  2, 'a planner can mark a batch'
);
select tests.clear_auth();
select is(
  (select sms_consent::text || '/' || sms_consent_source || '/' || (sms_consent_by = :'planner_user')::text
     from public.household_contacts where id = '11111111-0000-0000-0000-0000000000a1'),
  'opted_in/staff/true', 'the mark records the source and who made it'
);
select is(
  (select sms_consent_note from public.household_contacts where id = '11111111-0000-0000-0000-0000000000a1'),
  'address form, October', 'and the note'
);
select is(
  (select sms_consent::text from public.household_contacts where id = '11111111-0000-0000-0000-0000000000a2'),
  'declined', 'a declined number is left alone by a batch'
);

-- A single mark on a declined number needs an override.
select tests.authenticate_as(:'couple_user');
select throws_ok(
  $$select public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[], '11111111-0000-0000-0000-0000000000a2')$$,
  'P0001', 'declined_needs_override', 'a single mark on a declined number needs an override'
);
select is(
  (public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[], '11111111-0000-0000-0000-0000000000a2', 'mark', true) ->> 'marked')::int,
  1, 'with the override it is marked'
);
select tests.clear_auth();
select is(
  (select sms_consent_overrode_decline from public.household_contacts where id = '11111111-0000-0000-0000-0000000000a2'),
  true, 'and the record says it overrode a decline'
);

-- Repeating changes nothing and says so.
select tests.authenticate_as(:'couple_user');
select is(
  (public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[]) ->> 'already')::int,
  2, 'marking again counts the numbers already opted in'
);

-- Validation, all or nothing.
select throws_ok(
  $$select public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a', '99999999-0000-0000-0000-000000000009']::uuid[], null, 'clear')$$,
  'P0001', 'not_found', 'an unknown household refuses the whole batch'
);
select throws_ok(
  $$select public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[], null, 'mark', false, repeat('x', 201))$$,
  'P0001', 'invalid_payload', 'a note over 200 characters is refused'
);
select throws_ok(
  $$select public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[], null, 'nonsense')$$,
  'P0001', 'invalid_payload', 'an unknown mode is refused'
);
select throws_ok(
  $$select public.staff_set_sms_consent(array[]::uuid[])$$,
  'P0001', 'invalid_payload', 'an empty batch is refused'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.household_contacts where sms_consent = 'opted_in'), 4 - 1,
  'the refused batches changed nothing'
);

-- Clearing.
select tests.authenticate_as(:'couple_user');
select is(
  (public.staff_set_sms_consent(array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[], '11111111-0000-0000-0000-0000000000a1', 'clear') ->> 'cleared')::int,
  1, 'staff can clear one number''s mark'
);
select tests.clear_auth();
select is(
  (select sms_consent::text || coalesce(sms_consent_source, '-') || coalesce(sms_consent_note, '-')
     from public.household_contacts where id = '11111111-0000-0000-0000-0000000000a1'),
  'not_asked--', 'clearing empties every consent column'
);

-- A changed number loses its mark and everything about it.
update public.household_contacts set value = '+12025550199' where id = '11111111-0000-0000-0000-0000000000b1';
select is(
  (select sms_consent::text || (sms_consent_by is null)::text || sms_consent_overrode_decline::text
     from public.household_contacts where id = '11111111-0000-0000-0000-0000000000b1'),
  'not_askedtruefalse', 'changing a number clears its mark, who made it and the override flag'
);

-- Staff still cannot write the columns directly.
select tests.authenticate_as(:'couple_user');
select throws_ok(
  $$update public.household_contacts set sms_consent_by = null$$,
  '42501', null, 'staff cannot write the consent columns directly'
);
select tests.clear_auth();

-- The import function: service role only.
select tests.authenticate_as(:'couple_user');
select throws_ok(
  $$select public.import_phone_consent('bbbbbbbb-0000-0000-0000-00000000000b', '+12025550199', null)$$,
  '42501', null, 'staff cannot call the import function'
);
select tests.clear_auth();
select tests.authenticate_service_role();
select is(
  public.import_phone_consent('bbbbbbbb-0000-0000-0000-00000000000b', '+12025550199', :'couple_user'),
  '{"result": "marked"}'::jsonb, 'the import marks a number not yet asked'
);
select is(
  public.import_phone_consent('bbbbbbbb-0000-0000-0000-00000000000b', '+12025550199', :'couple_user'),
  '{"result": "already"}'::jsonb, 'and reports one already opted in'
);
select tests.clear_auth();
update public.household_contacts
   set sms_consent = 'declined', sms_consent_at = now(), sms_consent_source = 'first_sign_in'
 where id = '11111111-0000-0000-0000-0000000000a1';
select tests.authenticate_service_role();
select is(
  public.import_phone_consent('aaaaaaaa-0000-0000-0000-00000000000a', '+12025550101', :'couple_user'),
  '{"result": "declined_skipped"}'::jsonb, 'a declined number is skipped unless the import overrides'
);
select is(
  public.import_phone_consent('aaaaaaaa-0000-0000-0000-00000000000a', '+12025550101', :'couple_user', true),
  '{"result": "marked"}'::jsonb, 'with the override it is marked'
);
select tests.clear_auth();
select is(
  (select sms_consent_source from public.household_contacts where id = '11111111-0000-0000-0000-0000000000b1'),
  'import', 'and the source is recorded as import'
);

select * from finish();
rollback;
