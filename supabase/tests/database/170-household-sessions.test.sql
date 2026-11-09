-- Verify-first check (research R10): deleting a user's sessions removes their
-- refresh tokens too. The rest of this file is added with the sign-out
-- everywhere work.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(2);

select tests.create_user('household-sessions-a@example.test') as user_a \gset
select tests.create_user('household-sessions-b@example.test') as user_b \gset

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('aaaaaaaa-1700-0000-0000-000000000001', :'user_a', now(), now()),
  ('bbbbbbbb-1700-0000-0000-000000000001', :'user_b', now(), now());
insert into auth.refresh_tokens (instance_id, token, user_id, session_id, revoked) values
  ('00000000-0000-0000-0000-000000000000', 'fake-token-a', :'user_a'::text, 'aaaaaaaa-1700-0000-0000-000000000001', false),
  ('00000000-0000-0000-0000-000000000000', 'fake-token-b', :'user_b'::text, 'bbbbbbbb-1700-0000-0000-000000000001', false);

delete from auth.sessions where user_id = :'user_a';

select is(
  (select count(*)::int from auth.refresh_tokens where user_id = :'user_a'::text),
  0, 'deleting a user''s sessions removes their refresh tokens'
);
select is(
  (select count(*)::int from auth.refresh_tokens where user_id = :'user_b'::text),
  1, 'another user''s refresh tokens are untouched'
);

select * from finish();
rollback;
