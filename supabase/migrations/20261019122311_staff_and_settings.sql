-- Staff (the couple and the planner) and the single-row site settings.

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.settings (
  id boolean primary key default true check (id),
  default_rsvp_deadline timestamptz,
  rsvp_open boolean not null default true,
  couple_names text,
  last_dispatch_at timestamptz
);

-- The one and only settings row always exists, so the app only ever updates it.
insert into public.settings (id) values (true);

-- Role helpers. Security definer so policies on other tables can ask "is this
-- caller staff?" without needing read access to `staff` themselves.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

create function public.is_couple()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff where user_id = auth.uid() and role = 'couple'
  );
$$;

revoke execute on function public.is_staff(), public.is_couple() from public;
grant execute on function public.is_staff(), public.is_couple() to anon, authenticated, service_role;

-- Refuse any delete or demotion that would leave no couple account, so neither
-- the planner nor an accident can lock the couple out.
create function public.staff_keep_a_couple()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.staff where role = 'couple') then
    raise exception 'cannot remove or demote the last couple account'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create trigger staff_keep_a_couple
  after update of role or delete on public.staff
  for each row execute function public.staff_keep_a_couple();

-- Row-level security. Nothing is readable without signing in.
alter table public.staff enable row level security;
alter table public.settings enable row level security;

revoke all on public.staff, public.settings from anon;

create policy staff_select on public.staff
  for select to authenticated using (public.is_staff());
create policy staff_insert on public.staff
  for insert to authenticated with check (public.is_couple());
create policy staff_update on public.staff
  for update to authenticated using (public.is_couple()) with check (public.is_couple());
create policy staff_delete on public.staff
  for delete to authenticated using (public.is_couple());

-- Settings: every staff member reads and updates; the row is never inserted or
-- deleted through the API.
create policy settings_select on public.settings
  for select to authenticated using (public.is_staff());
create policy settings_update on public.settings
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke insert, delete on public.settings from authenticated;
