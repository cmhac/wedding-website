-- Cross-cutting: every table in the public schema has row-level security and
-- at least one policy, and nothing grants a privilege to anon. New tables that
-- skip these fail here.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select plan(5);

select is_empty(
  $$select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'every public table has row-level security enabled'
);

select is_empty(
  $$select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)$$,
  'every public table has at least one policy'
);

select is_empty(
  $$select table_name, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon'$$,
  'no table or view in public grants anything to anon'
);

select is_empty(
  $$select table_name, column_name, privilege_type from information_schema.role_column_grants
     where table_schema = 'public' and grantee = 'anon'$$,
  'no column in public grants anything to anon'
);

-- Views run with the caller's rights, so row-level security applies through them.
select is_empty(
  $$select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce(c.reloptions @> array['security_invoker=true'], false)$$,
  'every public view is security_invoker'
);

select * from finish();
rollback;
