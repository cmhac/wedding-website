-- Personal invite links (research R3 and R6). A link is derived from the
-- household id, a per-household version and a server secret, so the database
-- stores only the version: reissuing a link increments it and the old link
-- stops working. The version columns are staff-only: nothing here grants them
-- to the signed-in guest role, and they change only through
-- reissue_invite_link (added with the staff link controls).
--
-- Links close on the wedding day. The wedding event is chosen in settings; with
-- none chosen the links stay open and the admin overview warns about it.

alter table public.households
  add column invite_link_version integer not null default 1,
  add column invite_link_issued_at timestamptz not null default now();

alter table public.settings
  add column wedding_event_id uuid references public.events (id) on delete set null;

-- invite_links_open(at_time): true before the wedding event's date, comparing
-- calendar dates in America/Los_Angeles (the couple's time zone). The optional
-- argument lets tests ask about a moment other than now. Service role only:
-- the personal-link route calls it.
create function public.invite_links_open(at_time timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select (at_time at time zone 'America/Los_Angeles')::date
             < (e.starts_at at time zone 'America/Los_Angeles')::date
        from public.settings s
        join public.events e on e.id = s.wedding_event_id
       where e.starts_at is not null
    ),
    true
  );
$$;

revoke execute on function public.invite_links_open(timestamptz) from public, anon, authenticated;
grant execute on function public.invite_links_open(timestamptz) to service_role;
