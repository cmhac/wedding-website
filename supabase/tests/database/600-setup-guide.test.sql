-- The admin setup guide's two tables (specs/007-admin-setup-guide).
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
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', :'user_a');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.setup_guide_state'::regclass),
  'setup_guide_state has row-level security'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.setup_confirmations'::regclass),
  'setup_confirmations has row-level security'
);

-- A staff member keeps their own state.
select tests.authenticate_as(:'couple_user');
select lives_ok(
  format($$insert into public.setup_guide_state (user_id, skipped_steps, last_step, left_guide, seen_required)
           values (%L, array['rsvp_closed'], 'wedding_event', true, array['site_url'])$$, :'couple_user'),
  'a staff member can create their own state'
);
select is(
  (select count(*)::int from public.setup_guide_state), 1,
  'and read it'
);
select lives_ok(
  format($$update public.setup_guide_state set left_guide = false where user_id = %L$$, :'couple_user'),
  'and change it'
);
select throws_ok(
  format($$insert into public.setup_guide_state (user_id) values (%L)$$, :'planner_user'),
  '42501', null, 'but not create state for someone else'
);
select tests.clear_auth();

-- Another staff member cannot see or change it.
select tests.authenticate_as(:'planner_user');
select is(
  (select count(*)::int from public.setup_guide_state), 0,
  'another staff member cannot read it'
);
select is(
  (with u as (update public.setup_guide_state set left_guide = true returning 1) select count(*)::int from u), 0,
  'or change it'
);
select is(
  (with d as (delete from public.setup_guide_state returning 1) select count(*)::int from d), 0,
  'or delete it'
);
select tests.clear_auth();

-- Bad keys and over-long lists are refused.
select tests.authenticate_as(:'couple_user');
select throws_ok(
  format($$update public.setup_guide_state set skipped_steps = array['Not A Key'] where user_id = %L$$, :'couple_user'),
  '23514', null, 'a step key must be a plain lower-case name'
);
select throws_ok(
  format($$update public.setup_guide_state set skipped_steps = (select array_agg('k' || g) from generate_series(1, 31) g) where user_id = %L$$, :'couple_user'),
  '23514', null, 'more than 30 keys are refused'
);
select lives_ok(
  format($$delete from public.setup_guide_state where user_id = %L$$, :'couple_user'),
  'a staff member can delete their own state (restart)'
);
select tests.clear_auth();

-- A guest and anon cannot touch either table.
select tests.authenticate_as(:'user_a');
select throws_ok(
  format($$insert into public.setup_guide_state (user_id) values (%L)$$, :'user_a'),
  '42501', null, 'a guest cannot create guide state'
);
select throws_ok(
  format($$insert into public.setup_confirmations (step_key, confirmed_by) values ('sending_domain', %L)$$, :'user_a'),
  '42501', null, 'a guest cannot confirm a step'
);
select is((select count(*)::int from public.setup_confirmations), 0, 'a guest reads no confirmations');
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok($$select 1 from public.setup_guide_state$$, '42501', null, 'anon cannot read guide state');
select throws_ok($$select 1 from public.setup_confirmations$$, '42501', null, 'anon cannot read confirmations');
select tests.clear_auth();

-- Confirmations are shared among staff.
select tests.authenticate_as(:'couple_user');
select lives_ok(
  format($$insert into public.setup_confirmations (step_key, confirmed_by) values ('sending_domain', %L)$$, :'couple_user'),
  'staff can confirm a step'
);
select throws_ok(
  format($$insert into public.setup_confirmations (step_key, confirmed_by) values ('other', %L)$$, :'planner_user'),
  '42501', null, 'but only as themselves'
);
select tests.clear_auth();
select tests.authenticate_as(:'planner_user');
select is((select count(*)::int from public.setup_confirmations), 1, 'another staff member sees the confirmation');
select is(
  (with d as (delete from public.setup_confirmations returning 1) select count(*)::int from d), 1,
  'and can remove it'
);
select tests.clear_auth();

select * from finish();
rollback;
