-- Per-event headcounts. The view runs with the caller's rights (so row-level
-- security applies) and returns rows only to staff.
create view public.event_counts
with (security_invoker = true) as
select
  e.id as event_id,
  e.slug,
  e.name,
  count(i.guest_id) as invited,
  count(*) filter (where i.status = 'attending') as attending,
  count(*) filter (where i.status = 'declined') as declined,
  count(*) filter (where i.status = 'pending') as pending
from public.events e
left join public.invitations i on i.event_id = e.id
where public.is_staff()
group by e.id, e.slug, e.name;

revoke all on public.event_counts from public, anon;
grant select on public.event_counts to authenticated, service_role;
