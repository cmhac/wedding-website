-- Households (the unit that is invited and written to) and their guests.

-- Keeps `updated_at` current on any table that has the column.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  contact_email extensions.citext unique,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  address jsonb,
  plus_one_allowance smallint not null default 0 check (plus_one_allowance >= 0),
  rsvp_deadline_override timestamptz,
  reminders_opt_out boolean not null default false,
  message_to_couple text,
  notes text,
  delivery_problem boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  first_name text,
  last_name text,
  email extensions.citext,
  -- An unnamed plus-one seat. Only plus-one seats can be placeholders.
  is_placeholder boolean not null default false,
  -- Marks a guest who counts against the household's plus-one allowance. It
  -- stays true after the plus-one is named, so lowering the allowance can tell
  -- named plus-ones from ordinary guests.
  is_plus_one boolean not null default false,
  dietary_notes text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_named_unless_placeholder
    check (is_placeholder or (first_name is not null and last_name is not null)),
  constraint guests_placeholder_is_plus_one
    check (not is_placeholder or is_plus_one)
);

create index guests_household_id_idx on public.guests (household_id);

-- Two named guests in one household cannot share a name (ignoring case).
create unique index guests_unique_name_per_household
  on public.guests (household_id, lower(first_name), lower(last_name))
  where not is_placeholder;

create trigger guests_set_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

-- Plus-one seats (placeholders plus named plus-ones) cannot exceed the
-- household's allowance.
create function public.guests_enforce_plus_one_allowance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowance smallint;
  seats bigint;
begin
  if not new.is_plus_one then
    return new;
  end if;

  -- Lock the household so two concurrent inserts cannot both slip under the limit.
  select plus_one_allowance into allowance
    from public.households where id = new.household_id for update;
  if allowance is null then
    return new;
  end if;

  select count(*) into seats from public.guests
    where household_id = new.household_id and is_plus_one and id <> new.id;

  if seats + 1 > allowance then
    raise exception 'plus-one allowance exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guests_enforce_plus_one_allowance
  before insert or update of is_plus_one, household_id on public.guests
  for each row execute function public.guests_enforce_plus_one_allowance();

-- Lowering the allowance: refuse if it would drop below the named plus-ones,
-- otherwise remove unnamed placeholders above the new limit.
create function public.households_apply_lower_allowance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  named_plus_ones bigint;
  placeholders_to_remove bigint;
begin
  select count(*) filter (where not is_placeholder),
         greatest(count(*) filter (where is_placeholder) - greatest(new.plus_one_allowance - count(*) filter (where not is_placeholder), 0), 0)
    into named_plus_ones, placeholders_to_remove
    from public.guests
    where household_id = new.id and is_plus_one;

  if new.plus_one_allowance < named_plus_ones then
    raise exception 'cannot lower the plus-one allowance below the number of named plus-ones'
      using errcode = 'P0001';
  end if;

  if placeholders_to_remove > 0 then
    delete from public.guests
      where id in (
        select id from public.guests
          where household_id = new.id and is_placeholder
          order by created_at desc, id
          limit placeholders_to_remove
      );
  end if;
  return new;
end;
$$;

create trigger households_apply_lower_allowance
  before update of plus_one_allowance on public.households
  for each row
  when (new.plus_one_allowance < old.plus_one_allowance)
  execute function public.households_apply_lower_allowance();

-- The household the signed-in user answers for, if any. Security definer so
-- policies on other tables can use it without recursing through RLS.
create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.households where auth_user_id = auth.uid();
$$;

revoke execute on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated, service_role;

-- Row-level security: guests read their own household only; staff do everything
-- the privileges below allow; guests never write directly.
alter table public.households enable row level security;
alter table public.guests enable row level security;

revoke all on public.households, public.guests from anon;

-- Household changes to the sign-in account (contact email, linked auth user),
-- and creating or removing households, go through the admin API, which also
-- manages the linked sign-in account.
revoke insert, delete, update on public.households from authenticated;
grant update (
  display_name, address, plus_one_allowance, rsvp_deadline_override,
  reminders_opt_out, message_to_couple, notes, delivery_problem
) on public.households to authenticated;

create policy households_guest_select on public.households
  for select to authenticated using (auth_user_id = auth.uid());
create policy households_staff_all on public.households
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy guests_guest_select on public.guests
  for select to authenticated using (household_id = public.current_household_id());
create policy guests_staff_all on public.guests
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
