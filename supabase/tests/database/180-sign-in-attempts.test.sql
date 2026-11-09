-- Durable limits on typed-address sign-in requests: sign_in_attempts holds
-- hashes (never addresses), allow_sign_in_attempt applies the per-address and
-- overall limits from settings, and only the service role can use either.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(16);

select tests.create_user('couple@example.test') as couple_user \gset
insert into public.staff (user_id, role, display_name) values (:'couple_user', 'couple', 'Couple');

-- Table.
select has_table('public', 'sign_in_attempts', 'the table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.sign_in_attempts'::regclass),
  true, 'row-level security is on'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'sign_in_attempts' and qual = 'false'),
  1, 'its only policy refuses every row (access is through the function)'
);
select columns_are('public', 'sign_in_attempts', array['id', 'address_hash', 'at'], 'it holds a hash and a time, nothing else');
select ok(
  not has_table_privilege('authenticated', 'public.sign_in_attempts', 'SELECT')
  and not has_table_privilege('anon', 'public.sign_in_attempts', 'SELECT'),
  'signed-in users and anon cannot read it'
);

-- Settings.
select is(
  (select array[sign_in_limit_per_address::int, sign_in_window_minutes::int, sign_in_limit_global_per_hour] from public.settings),
  array[3, 10, 60], 'the limits default to 3 per address per 10 minutes and 60 an hour overall'
);

-- Limits.
select tests.authenticate_service_role();
select is(public.allow_sign_in_attempt('hash-a'), true, 'the first request is allowed');
select is(public.allow_sign_in_attempt('hash-a'), true, 'the second too');
select is(public.allow_sign_in_attempt('hash-a'), true, 'and the third');
select is(public.allow_sign_in_attempt('hash-a'), false, 'the fourth within the window is refused');
select is(public.allow_sign_in_attempt('hash-b'), true, 'another address is counted separately');
select tests.clear_auth();

select is((select count(*)::int from public.sign_in_attempts where address_hash = 'hash-a'), 4, 'every call is recorded, refused ones too');

-- The window slides: old attempts stop counting.
update public.sign_in_attempts set at = now() - interval '11 minutes' where address_hash = 'hash-a';
select tests.authenticate_service_role();
select is(public.allow_sign_in_attempt('hash-a'), true, 'attempts older than the window no longer count');

-- Overall limit.
update public.settings set sign_in_limit_global_per_hour = 3;
select is(public.allow_sign_in_attempt('hash-c'), false, 'the overall hourly limit refuses even a new address');
select tests.clear_auth();

-- Cleanup of rows older than a day.
update public.sign_in_attempts set at = now() - interval '2 days' where address_hash = 'hash-b';
select tests.authenticate_service_role();
select public.cleanup_sign_in_attempts();
select tests.clear_auth();
select is((select count(*)::int from public.sign_in_attempts where address_hash = 'hash-b'), 0, 'rows older than a day are deleted');

-- Only the service role.
select ok(
  has_function_privilege('service_role', 'public.allow_sign_in_attempt(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.allow_sign_in_attempt(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.allow_sign_in_attempt(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.cleanup_sign_in_attempts()', 'EXECUTE'),
  'only the service role can execute the limiter and the cleanup'
);

select * from finish();
rollback;
