-- set_reminders_opt_out: a guest changes only their own household.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(14);

select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset
select tests.create_user('outsider@example.test') as outsider \gset
select tests.create_user('couple@example.test') as couple_user \gset

insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');
insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b');

select tests.authenticate_anon();
select throws_ok($$select public.set_reminders_opt_out(true)$$, 'P0001', 'not_a_guest', 'anon gets not_a_guest');
select tests.clear_auth();

select tests.authenticate_as(:'outsider');
select throws_ok($$select public.set_reminders_opt_out(true)$$, 'P0001', 'not_a_guest', 'a signed-in user with no household gets not_a_guest');
select tests.clear_auth();

select tests.authenticate_as(:'couple_user');
select throws_ok($$select public.set_reminders_opt_out(true)$$, 'P0001', 'not_a_guest', 'staff without a household get not_a_guest');
select tests.clear_auth();

select tests.authenticate_as(:'user_a');
select is(public.set_reminders_opt_out(true), true, 'a guest opts out and gets the new value back');
select is((select reminders_opt_out from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), true, 'the guest''s household is opted out');
select tests.clear_auth();
select is((select reminders_opt_out from public.households where id = 'bbbbbbbb-0000-0000-0000-00000000000b'), false, 'another household is untouched');

select tests.authenticate_as(:'user_a');
select is(public.set_reminders_opt_out(true), true, 'repeating the same value is fine');
select is(public.set_reminders_opt_out(false), false, 'a guest can opt back in');
select is((select reminders_opt_out from public.households where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), false, 'the household is opted back in');
select throws_ok($$select public.set_reminders_opt_out(null)$$, 'P0001', 'invalid_payload', 'null is invalid_payload');
select tests.clear_auth();

select tests.authenticate_as(:'user_b');
select is(public.set_reminders_opt_out(true), true, 'another guest opts out');
select tests.clear_auth();
select is(
  (select array_agg(reminders_opt_out order by display_name) from public.households),
  array[false, true], 'each household holds its own value'
);
select ok(
  exists (
    select 1 from public.audit_log
    where entity = 'households' and action = 'update' and actor_kind = 'guest'
      and entity_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and 'reminders_opt_out' = any (changed_fields)
  ),
  'the change is audited as a guest action on the opt-out column'
);

select * from finish();
rollback;
