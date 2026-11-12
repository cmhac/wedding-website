-- The admin setup guide (specs/007-admin-setup-guide). Two small tables:
--   setup_guide_state   one row per staff member: what they skipped, where they
--                       were, and whether they left the guide. Interface state
--                       only; whether a step is done is never stored.
--   setup_confirmations a shared mark for a step the site cannot check itself
--                       (for example that the sending domain is verified).

-- A list of step keys is short and each key is a plain lower-case name.
create function public.setup_keys_ok(keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(keys, 1), 0) <= 30
     and not exists (select 1 from unnest(keys) as k where k !~ '^[a-z0-9_]{1,40}$');
$$;

create table public.setup_guide_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  skipped_steps text[] not null default '{}' check (public.setup_keys_ok(skipped_steps)),
  last_step text check (last_step is null or last_step ~ '^[a-z0-9_]{1,40}$'),
  left_guide boolean not null default false,
  seen_required text[] not null default '{}' check (public.setup_keys_ok(seen_required)),
  updated_at timestamptz not null default now()
);

create trigger setup_guide_state_set_updated_at
  before update on public.setup_guide_state
  for each row execute function public.set_updated_at();

alter table public.setup_guide_state enable row level security;
revoke all on public.setup_guide_state from anon, authenticated;
grant select, insert, update, delete on public.setup_guide_state to authenticated;
grant all on public.setup_guide_state to service_role;

-- A staff member sees and changes only their own row.
create policy setup_guide_state_select on public.setup_guide_state
  for select to authenticated using (public.is_staff() and user_id = auth.uid());
create policy setup_guide_state_insert on public.setup_guide_state
  for insert to authenticated with check (public.is_staff() and user_id = auth.uid());
create policy setup_guide_state_update on public.setup_guide_state
  for update to authenticated
  using (public.is_staff() and user_id = auth.uid())
  with check (public.is_staff() and user_id = auth.uid());
create policy setup_guide_state_delete on public.setup_guide_state
  for delete to authenticated using (public.is_staff() and user_id = auth.uid());

create table public.setup_confirmations (
  step_key text primary key check (step_key ~ '^[a-z0-9_]{1,40}$'),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now()
);

alter table public.setup_confirmations enable row level security;
revoke all on public.setup_confirmations from anon, authenticated;
grant select, insert, delete on public.setup_confirmations to authenticated;
grant all on public.setup_confirmations to service_role;

create policy setup_confirmations_select on public.setup_confirmations
  for select to authenticated using (public.is_staff());
create policy setup_confirmations_insert on public.setup_confirmations
  for insert to authenticated with check (public.is_staff() and confirmed_by = auth.uid());
create policy setup_confirmations_delete on public.setup_confirmations
  for delete to authenticated using (public.is_staff());
