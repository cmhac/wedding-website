-- Events and the per-guest, per-event invitations (which also hold the RSVP).

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  starts_at timestamptz,
  venue_name text,
  is_required boolean not null,
  group_key text,
  rsvp_deadline timestamptz,
  display_order smallint
);

create table public.invitations (
  guest_id uuid not null references public.guests (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status public.rsvp_status not null default 'pending',
  responded_at timestamptz,
  responded_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  invited_by uuid references auth.users (id) on delete set null,
  primary key (guest_id, event_id)
);

create index invitations_event_id_idx on public.invitations (event_id);

-- The deadline that applies to one household for one event: the household's
-- own override, else the event's deadline, else the site-wide default.
-- Security definer because guests cannot read `settings` directly.
create function public.effective_rsvp_deadline(p_household_id uuid, p_event_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select rsvp_deadline_override from public.households where id = p_household_id),
    (select rsvp_deadline from public.events where id = p_event_id),
    (select default_rsvp_deadline from public.settings)
  );
$$;

revoke execute on function public.effective_rsvp_deadline(uuid, uuid) from public, anon;
grant execute on function public.effective_rsvp_deadline(uuid, uuid) to authenticated, service_role;

alter table public.events enable row level security;
alter table public.invitations enable row level security;

revoke all on public.events, public.invitations from anon;

-- Guests read only invitations for guests in their own household, and only the
-- events those invitations point at.
create policy invitations_guest_select on public.invitations
  for select to authenticated
  using (exists (
    select 1 from public.guests g
    where g.id = invitations.guest_id and g.household_id = public.current_household_id()
  ));
create policy invitations_staff_all on public.invitations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy events_guest_select on public.events
  for select to authenticated
  using (exists (select 1 from public.invitations i where i.event_id = events.id));
create policy events_staff_all on public.events
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
