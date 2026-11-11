-- household_contacts: one row per way to reach a household. Row-level security,
-- uniqueness across households, the staff-address rule, the delivery flag and
-- the audit trail. Fake addresses only.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(27);

select tests.create_user('couple@example.test') as couple_user \gset
select tests.create_user('household-a@households.invalid') as user_a \gset
select tests.create_user('household-b@households.invalid') as user_b \gset

insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');
insert into public.households (id, display_name, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', :'user_b');

select has_table('public', 'household_contacts', 'the table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.household_contacts'::regclass),
  true, 'row-level security is on'
);
select has_type('public', 'contact_kind', 'the contact kind type exists');
select columns_are(
  'public', 'household_contacts',
  array['id', 'household_id', 'kind', 'value', 'delivery_problem', 'created_at', 'sms_consent', 'sms_consent_at', 'sms_consent_source'],
  'the columns are as designed'
);

-- Values are trimmed and lower-cased on write.
insert into public.household_contacts (household_id, kind, value) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', '  Ann.Fake@Example.TEST ');
select is(
  (select value::text from public.household_contacts where household_id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  'ann.fake@example.test', 'an address is trimmed and lower-cased on write'
);

-- Unique across households, ignoring case.
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'ANN.FAKE@example.test')$$,
  '23505', null, 'the same address cannot belong to two households'
);

-- A household can have several addresses.
select lives_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'ann.second@example.test')$$,
  'a household can have more than one address'
);

-- Malformed addresses are refused.
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'not-an-email')$$,
  '23514', null, 'a malformed address is refused'
);

-- An address that belongs to a staff account is refused, on insert and update.
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'Couple@example.test')$$,
  'P0001', 'staff_account', 'a staff address cannot be a household contact'
);
insert into public.household_contacts (id, household_id, kind, value) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'bea.fake@example.test');
select throws_ok(
  $$update public.household_contacts set value = 'couple@example.test'
    where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'P0001', 'staff_account', 'changing an address to a staff address is refused'
);

-- Delivery flag: household flag follows its contacts.
select is(
  (select delivery_problem from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  false, 'a household starts without a delivery problem'
);
update public.household_contacts set delivery_problem = true
  where id = 'cccccccc-0000-0000-0000-000000000001';
select is(
  (select delivery_problem from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  true, 'flagging a contact flags its household'
);
update public.household_contacts set value = 'bea.new@example.test'
  where id = 'cccccccc-0000-0000-0000-000000000001';
select is(
  (select delivery_problem from public.household_contacts where id = 'cccccccc-0000-0000-0000-000000000001'),
  false, 'changing the address clears its flag'
);
select is(
  (select delivery_problem from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  false, 'and the household flag clears with it'
);
update public.household_contacts set value = upper(value)
  where id = 'cccccccc-0000-0000-0000-000000000001';
update public.household_contacts set delivery_problem = true
  where id = 'cccccccc-0000-0000-0000-000000000001';
update public.household_contacts set value = upper('bea.new@example.test')
  where id = 'cccccccc-0000-0000-0000-000000000001';
select is(
  (select delivery_problem from public.household_contacts where id = 'cccccccc-0000-0000-0000-000000000001'),
  true, 'a change of letter case alone keeps the flag'
);
delete from public.household_contacts where id = 'cccccccc-0000-0000-0000-000000000001';
select is(
  (select delivery_problem from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  false, 'removing the flagged address clears the household flag'
);

-- Guest access: own household's rows, read only.
select tests.authenticate_as(:'user_a');
select is(
  (select count(*)::int from public.household_contacts), 2,
  'a guest reads only their own household''s addresses'
);
select throws_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'email', 'guest.added@example.test')$$,
  '42501', null, 'a guest cannot add an address'
);
update public.household_contacts set value = 'guest.changed@example.test';
delete from public.household_contacts;
select tests.clear_auth();
select is(
  (select count(*)::int from public.household_contacts
    where household_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
      and value in ('ann.fake@example.test', 'ann.second@example.test')),
  2, 'a guest can neither change nor remove an address'
);

-- Anon reads nothing and holds no privileges.
select tests.authenticate_anon();
select throws_ok(
  $$select count(*) from public.household_contacts$$,
  '42501', null, 'anon has no access'
);
select tests.clear_auth();

-- Staff can do everything.
select tests.authenticate_as(:'couple_user');
select is(
  (select count(*)::int from public.household_contacts), 2, 'staff read all addresses'
);
select lives_ok(
  $$insert into public.household_contacts (household_id, kind, value)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'email', 'staff.added@example.test')$$,
  'staff can add an address'
);
select lives_ok(
  $$update public.household_contacts set value = 'staff.changed@example.test'
    where value = 'staff.added@example.test'$$,
  'staff can change an address'
);
select lives_ok(
  $$delete from public.household_contacts where value = 'staff.changed@example.test'$$,
  'staff can remove an address'
);
select tests.clear_auth();

-- Audit: column names only, never values.
select is(
  (select count(*)::int from public.audit_log where entity = 'household_contacts'),
  (select count(*)::int from public.audit_log where entity = 'household_contacts' and actor_kind is not null),
  'changes to addresses appear in the audit log'
);
select is(
  (select count(*)::int from public.audit_log
    where entity = 'household_contacts'
      and array_to_string(changed_fields, ',') ~ '@'),
  0, 'the audit log holds column names, not addresses'
);
select ok(
  (select count(*) from public.audit_log where entity = 'household_contacts') > 0,
  'the audit log has entries for contacts'
);

select * from finish();
rollback;
