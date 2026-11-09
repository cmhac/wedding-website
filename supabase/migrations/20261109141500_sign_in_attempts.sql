-- Durable limits on typed-address sign-in requests (research R12). Guests'
-- sign-in emails are sent by the site, so Supabase's per-email limit no longer
-- applies; this replaces it. Only a keyed hash of the address is stored.

alter table public.settings
  add column sign_in_limit_per_address smallint not null default 3 check (sign_in_limit_per_address > 0),
  add column sign_in_window_minutes smallint not null default 10 check (sign_in_window_minutes > 0),
  add column sign_in_limit_global_per_hour integer not null default 60 check (sign_in_limit_global_per_hour > 0);

create table public.sign_in_attempts (
  id bigint generated always as identity primary key,
  address_hash text not null,
  at timestamptz not null default now()
);

create index sign_in_attempts_address_at_idx on public.sign_in_attempts (address_hash, at);
create index sign_in_attempts_at_idx on public.sign_in_attempts (at);

-- Row-level security on, and one policy that refuses every row: the table is
-- reached only through the security-definer functions below.
alter table public.sign_in_attempts enable row level security;
revoke all on public.sign_in_attempts from anon, authenticated;
create policy sign_in_attempts_no_direct_access on public.sign_in_attempts
  for all to authenticated, anon using (false) with check (false);

-- allow_sign_in_attempt(address_hash): records the attempt and says whether it
-- may go ahead: at most the per-address limit inside the window, and at most
-- the overall hourly limit. Refused attempts are recorded too, so hammering an
-- address keeps it blocked.
create function public.allow_sign_in_attempt(address_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settings;
  v_per_address integer;
  v_global integer;
begin
  select * into s from public.settings limit 1;

  select count(*) into v_per_address from public.sign_in_attempts a
   where a.address_hash = allow_sign_in_attempt.address_hash
     and a.at > now() - make_interval(mins => s.sign_in_window_minutes);
  select count(*) into v_global from public.sign_in_attempts a
   where a.at > now() - interval '1 hour';

  insert into public.sign_in_attempts (address_hash) values (allow_sign_in_attempt.address_hash);

  return v_per_address < s.sign_in_limit_per_address
     and v_global < s.sign_in_limit_global_per_hour;
end;
$$;

create function public.cleanup_sign_in_attempts()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sign_in_attempts where at < now() - interval '1 day';
$$;

revoke execute on function public.allow_sign_in_attempt(text), public.cleanup_sign_in_attempts()
  from public, anon, authenticated;
grant execute on function public.allow_sign_in_attempt(text), public.cleanup_sign_in_attempts()
  to service_role;

-- The existing 5-minute job also clears old attempts (same name replaces the job).
create or replace function private.dispatch_scheduled()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  delete from public.sign_in_attempts where at < now() - interval '1 day';

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
