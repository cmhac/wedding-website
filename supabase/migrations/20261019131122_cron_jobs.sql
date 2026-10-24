-- Scheduled sends: every 5 minutes, pg_cron asks the site to run due campaigns.
-- The site URL and CRON_SECRET are read from Supabase Vault at run time, never
-- stored in this file or in a table of ours. Create them once per project:
--
--   select vault.create_secret('https://example.org', 'site_url');
--   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
--
-- Until both exist (for example in local development) the job does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.dispatch_scheduled()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'site_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'cron_secret';
  if nullif(v_url, '') is null or nullif(v_secret, '') is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/api/internal/dispatch-scheduled',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function private.dispatch_scheduled() from public, anon, authenticated;

-- cron.schedule with an existing name replaces that job, so re-running is safe.
select cron.schedule('dispatch-scheduled', '*/5 * * * *', 'select private.dispatch_scheduled()');
