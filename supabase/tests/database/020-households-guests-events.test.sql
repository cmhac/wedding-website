-- Households, guests, events, invitations: access rules, constraints, plus-one rules.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select plan(62);

-- People (all fake): two signed-in households, one staff member.
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset
select tests.create_user('staff@example.test') as staff_user \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'couple', 'Staff');

-- Fixtures, inserted as the test runner (bypasses row-level security).
insert into public.households (id, display_name, contact_email, auth_user_id, plus_one_allowance) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a', 0),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b', 0);

insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta');

insert into public.events (id, slug, name, is_required, group_key, display_order) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'event-one', 'Event One', true, 'weekend', 1),
  ('eeeeeeee-0000-0000-0000-000000000002', 'event-two', 'Event Two', false, 'weekend', 2),
  ('eeeeeeee-0000-0000-0000-000000000003', 'event-three', 'Event Three', false, null, 3);

-- A is invited to event one only; B is invited to events one and two.
insert into public.invitations (guest_id, event_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000002');

-- Anonymous visitors: nothing.
select tests.authenticate_anon();
select throws_ok('select * from public.households', '42501', null, 'anon cannot read households');
select throws_ok('select * from public.guests', '42501', null, 'anon cannot read guests');
select throws_ok('select * from public.events', '42501', null, 'anon cannot read events');
select throws_ok('select * from public.invitations', '42501', null, 'anon cannot read invitations');
select tests.clear_auth();

-- Guest A: sees only household A's data.
select tests.authenticate_as(:'user_a');
select results_eq(
  'select display_name from public.households',
  $$values ('Household A'::text)$$,
  'guest A reads only household A'
);
select results_eq(
  'select first_name from public.guests order by first_name',
  $$values ('Ada'::text), ('Alan'::text)$$,
  'guest A reads only household A guests'
);
select is((select count(*) from public.invitations), 2::bigint, 'guest A reads only household A invitations');
select results_eq(
  'select slug from public.events',
  $$values ('event-one'::text)$$,
  'guest A reads only events the household is invited to'
);

-- Guest A cannot write anything directly.
select throws_ok(
  $$insert into public.households (display_name) values ('Sneaky')$$, '42501', null,
  'guest A cannot insert households'
);
select is_empty(
  $$with u as (update public.households set display_name = 'Changed' returning 1) select * from u$$,
  'guest A cannot update households'
);
select throws_ok(
  $$delete from public.households$$, '42501', null, 'guest A cannot delete households'
);
select throws_ok(
  $$insert into public.guests (household_id, first_name, last_name)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Eve', 'Intruder')$$,
  '42501', null, 'guest A cannot insert guests'
);
select is_empty(
  $$with u as (update public.guests set first_name = 'Changed' returning 1) select * from u$$,
  'guest A cannot update guests'
);
select is_empty(
  $$with d as (delete from public.guests returning 1) select * from d$$,
  'guest A cannot delete guests'
);
select throws_ok(
  $$insert into public.events (slug, name, is_required) values ('mine', 'Mine', false)$$, '42501', null,
  'guest A cannot insert events'
);
select is_empty(
  $$with u as (update public.events set name = 'Changed' returning 1) select * from u$$,
  'guest A cannot update events'
);
select is_empty(
  $$with d as (delete from public.events returning 1) select * from d$$,
  'guest A cannot delete events'
);
select throws_ok(
  $$insert into public.invitations (guest_id, event_id)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000002')$$,
  '42501', null, 'guest A cannot insert invitations'
);
select is_empty(
  $$with u as (update public.invitations set status = 'attending' returning 1) select * from u$$,
  'guest A cannot update invitations'
);
select is_empty(
  $$with d as (delete from public.invitations returning 1) select * from d$$,
  'guest A cannot delete invitations'
);
select tests.clear_auth();

-- Privileges: the sign-in account changes only through the admin API.
select ok(not has_table_privilege('authenticated', 'public.households', 'INSERT'), 'authenticated cannot insert households');
select ok(not has_table_privilege('authenticated', 'public.households', 'DELETE'), 'authenticated cannot delete households');
select ok(not has_column_privilege('authenticated', 'public.households', 'contact_email', 'UPDATE'), 'authenticated cannot update contact_email');
select ok(not has_column_privilege('authenticated', 'public.households', 'auth_user_id', 'UPDATE'), 'authenticated cannot update auth_user_id');
select ok(has_column_privilege('authenticated', 'public.households', 'display_name', 'UPDATE'), 'authenticated can update display_name');

-- Staff can do everything the privileges allow.
select tests.authenticate_as(:'staff_user');
select is((select count(*) from public.households), 2::bigint, 'staff reads all households');
select is((select count(*) from public.guests), 3::bigint, 'staff reads all guests');
select is((select count(*) from public.events), 3::bigint, 'staff reads all events');
select is((select count(*) from public.invitations), 4::bigint, 'staff reads all invitations');
select lives_ok(
  $$update public.households set display_name = 'Household A (renamed)', notes = 'n'
    where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  'staff can update household columns other than the protected ones'
);
select throws_ok(
  $$update public.households set contact_email = 'x@example.test'
    where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  '42501', null, 'staff cannot update contact_email directly'
);
select throws_ok(
  $$insert into public.households (display_name) values ('New')$$, '42501', null,
  'staff cannot insert households directly'
);
select throws_ok(
  $$delete from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, '42501', null,
  'staff cannot delete households directly'
);
select lives_ok(
  $$insert into public.guests (household_id, first_name, last_name)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Cy', 'Alpha')$$,
  'staff can insert guests'
);
select lives_ok(
  $$update public.guests set email = 'cy@example.test' where first_name = 'Cy'$$,
  'staff can update guests'
);
select lives_ok($$delete from public.guests where first_name = 'Cy'$$, 'staff can delete guests');
select lives_ok(
  $$insert into public.events (slug, name, is_required) values ('event-four', 'Event Four', false)$$,
  'staff can insert events'
);
select lives_ok(
  $$update public.events set name = 'Event Four!' where slug = 'event-four'$$, 'staff can update events'
);
select lives_ok($$delete from public.events where slug = 'event-four'$$, 'staff can delete events');
select lives_ok(
  $$insert into public.invitations (guest_id, event_id)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000002')$$,
  'staff can insert invitations'
);
select lives_ok(
  $$update public.invitations set status = 'attending'
    where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      and event_id = 'eeeeeeee-0000-0000-0000-000000000002'$$,
  'staff can update invitations'
);
select lives_ok(
  $$delete from public.invitations
    where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      and event_id = 'eeeeeeee-0000-0000-0000-000000000002'$$,
  'staff can delete invitations'
);
select tests.clear_auth();

-- Constraints.
select throws_ok(
  $$insert into public.households (display_name, contact_email) values ('Dup', 'A@EXAMPLE.TEST')$$,
  '23505', null, 'contact_email is unique ignoring case'
);
select throws_ok(
  $$insert into public.households (display_name, plus_one_allowance) values ('Neg', -1)$$,
  '23514', null, 'plus_one_allowance cannot be negative'
);
select throws_ok(
  $$insert into public.guests (household_id, first_name, last_name)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', null, null)$$,
  '23514', null, 'a named guest needs both names'
);
select throws_ok(
  $$insert into public.guests (household_id, first_name, last_name)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'ADA', 'alpha')$$,
  '23505', null, 'guest names are unique per household ignoring case'
);
select lives_ok(
  $$insert into public.guests (household_id, first_name, last_name)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'Ada', 'Alpha')$$,
  'the same name is fine in another household'
);
select throws_ok(
  $$insert into public.guests (household_id, is_placeholder)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', true)$$,
  '23514', null, 'a placeholder must be a plus-one seat'
);
select throws_ok(
  $$insert into public.invitations (guest_id, event_id)
    values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001')$$,
  '23505', null, 'an invitation is unique per guest and event'
);
select is(
  (select status::text from public.invitations
    where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'pending', 'invitation status defaults to pending'
);
select throws_ok(
  $$insert into public.events (slug, name, is_required) values ('event-one', 'Again', true)$$,
  '23505', null, 'event slug is unique'
);

-- Plus-one rules. Household C allows 2: one named plus-one and one placeholder.
insert into public.households (id, display_name, plus_one_allowance)
  values ('cccccccc-0000-0000-0000-00000000000c', 'Household C', 2);
insert into public.guests (id, household_id, first_name, last_name, is_plus_one) values
  ('cccccccc-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-00000000000c', 'Cora', 'Gamma', false),
  ('cccccccc-0000-0000-0000-0000000000c2', 'cccccccc-0000-0000-0000-00000000000c', 'Named', 'Plusone', true);
select lives_ok(
  $$insert into public.guests (household_id, is_placeholder, is_plus_one)
    values ('cccccccc-0000-0000-0000-00000000000c', true, true)$$,
  'a placeholder within the allowance is accepted'
);
select throws_ok(
  $$insert into public.guests (household_id, is_placeholder, is_plus_one)
    values ('cccccccc-0000-0000-0000-00000000000c', true, true)$$,
  'P0001', 'plus-one allowance exceeded', 'a placeholder beyond the allowance is refused'
);
select lives_ok(
  $$update public.households set plus_one_allowance = 1 where id = 'cccccccc-0000-0000-0000-00000000000c'$$,
  'lowering the allowance down to the named plus-ones is accepted'
);
select is(
  (select count(*) from public.guests
    where household_id = 'cccccccc-0000-0000-0000-00000000000c' and is_placeholder),
  0::bigint, 'unnamed placeholders above the lowered limit are removed'
);
select is(
  (select count(*) from public.guests where household_id = 'cccccccc-0000-0000-0000-00000000000c'),
  2::bigint, 'named guests are kept when the allowance is lowered'
);
select throws_ok(
  $$update public.households set plus_one_allowance = 0 where id = 'cccccccc-0000-0000-0000-00000000000c'$$,
  'P0001', 'cannot lower the plus-one allowance below the number of named plus-ones',
  'lowering the allowance below the named plus-ones is refused'
);

-- Effective deadline: household override, then event, then the default.
update public.settings set default_rsvp_deadline = '2027-01-01T00:00:00Z';
update public.events set rsvp_deadline = '2027-02-01T00:00:00Z' where slug = 'event-one';
update public.households set rsvp_deadline_override = '2027-03-01T00:00:00Z'
  where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select is(
  public.effective_rsvp_deadline('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-000000000001'),
  '2027-03-01T00:00:00Z'::timestamptz, 'household override wins'
);
select is(
  public.effective_rsvp_deadline('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-000000000001'),
  '2027-02-01T00:00:00Z'::timestamptz, 'event deadline is next'
);
select is(
  public.effective_rsvp_deadline('bbbbbbbb-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-000000000002'),
  '2027-01-01T00:00:00Z'::timestamptz, 'settings default is last'
);

-- Deleting a household removes its guests and invitations.
delete from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select is(
  (select count(*) from public.guests where household_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  0::bigint, 'deleting a household deletes its guests'
);
select is(
  (select count(*) from public.invitations where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b1'),
  0::bigint, 'deleting a household deletes its invitations'
);

select * from finish();
rollback;
