-- Household contacts: one row per way to reach a household. A household can
-- have several addresses; an address belongs to at most one household. Only
-- email for now (the contact kind leaves room for phone numbers later).
--
-- The address that used to live in households.contact_email is copied here.
-- The column itself is dropped in the next migration, once the functions that
-- read it have been changed.

create type public.contact_kind as enum ('email');

create table public.household_contacts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind public.contact_kind not null default 'email',
  value extensions.citext not null,
  delivery_problem boolean not null default false,
  created_at timestamptz not null default now(),
  constraint household_contacts_unique_value unique (kind, value),
  constraint household_contacts_email_shape
    check (kind <> 'email' or value::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create index household_contacts_household_id_idx on public.household_contacts (household_id);

-- Move the existing addresses (and their delivery flags) before the triggers
-- exist, so nothing here is refused or recomputed.
insert into public.household_contacts (household_id, kind, value, delivery_problem)
select h.id, 'email', lower(btrim(h.contact_email::text)), h.delivery_problem
  from public.households h
 where h.contact_email is not null;

-- 1. Trim and lower-case on write.
create function private.household_contacts_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.value := lower(btrim(new.value::text));
  return new;
end;
$$;

-- 2. A staff member's sign-in address is never a household contact.
create function private.household_contacts_refuse_staff_address()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.staff s
      join auth.users u on u.id = s.user_id
     where lower(u.email) = lower(new.value::text)
  ) then
    raise exception 'staff_account' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- 3. A delivery problem belongs to an address: a new address starts clean. A
-- change of letter case only is not a new address (the column is case-insensitive).
create function private.household_contacts_clear_delivery_problem()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.delivery_problem := false;
  return new;
end;
$$;

-- The household's own flag is "any address has a problem".
create function private.household_contacts_sync_household_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  v_ids := case tg_op
    when 'INSERT' then array[new.household_id]
    when 'DELETE' then array[old.household_id]
    else array[old.household_id, new.household_id]
  end;
  foreach v_id in array v_ids loop
    update public.households h
       set delivery_problem = exists (
         select 1 from public.household_contacts c
          where c.household_id = v_id and c.delivery_problem
       )
     where h.id = v_id
       and h.delivery_problem is distinct from exists (
         select 1 from public.household_contacts c
          where c.household_id = v_id and c.delivery_problem
       );
  end loop;
  return null;
end;
$$;

revoke execute on function
  private.household_contacts_normalize(),
  private.household_contacts_refuse_staff_address(),
  private.household_contacts_clear_delivery_problem(),
  private.household_contacts_sync_household_flag()
from public;

create trigger household_contacts_a_normalize
  before insert or update of value on public.household_contacts
  for each row execute function private.household_contacts_normalize();
create trigger household_contacts_b_refuse_staff_address
  before insert or update of value on public.household_contacts
  for each row execute function private.household_contacts_refuse_staff_address();
create trigger household_contacts_c_clear_delivery_problem
  before update of value on public.household_contacts
  for each row
  when (new.value is distinct from old.value)
  execute function private.household_contacts_clear_delivery_problem();
create trigger household_contacts_sync_household_flag
  after insert or update or delete on public.household_contacts
  for each row execute function private.household_contacts_sync_household_flag();
create trigger household_contacts_audit
  after insert or update or delete on public.household_contacts
  for each row execute function public.audit_row_change();

-- The old trigger watched the column that is about to go.
drop trigger households_clear_delivery_problem on public.households;
drop function public.households_clear_delivery_problem();

-- Row-level security: staff everything; a guest reads their own household's
-- rows (the guest API masks the addresses) and never writes; anon nothing.
alter table public.household_contacts enable row level security;

revoke all on public.household_contacts from anon, authenticated;
grant select, insert, update, delete on public.household_contacts to authenticated;

create policy household_contacts_guest_select on public.household_contacts
  for select to authenticated using (household_id = public.current_household_id());
create policy household_contacts_staff_all on public.household_contacts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
