-- Per-household RSVP progress, so a household that answered every required
-- event is not reported as unresponsive just because an optional event
-- (welcome party, rehearsal) is still open.
--
-- Counts are of outstanding answers (a guest and an event), not of events:
--   pending_required  unanswered invitations to required events
--   pending_optional  unanswered invitations to optional events
--   pending_meals     attending guests with no choice for a course that
--                     requires one, on a published menu, where the course has
--                     at least one dish that can be chosen
-- Households with nothing outstanding (or no invitations) still appear, with
-- zeros. The view runs with the caller's rights and returns rows to staff only.
create view public.household_rsvp_progress
with (security_invoker = true) as
select
  h.id as household_id,
  h.display_name,
  coalesce(p.pending_required, 0) as pending_required,
  coalesce(p.pending_optional, 0) as pending_optional,
  coalesce(m.pending_meals, 0) as pending_meals
from public.households h
left join lateral (
  select
    count(*) filter (where e.is_required and i.status = 'pending') as pending_required,
    count(*) filter (where not e.is_required and i.status = 'pending') as pending_optional
  from public.guests g
  join public.invitations i on i.guest_id = g.id
  join public.events e on e.id = i.event_id
  where g.household_id = h.id
) p on true
left join lateral (
  select count(*) as pending_meals
  from public.guests g
  join public.invitations i on i.guest_id = g.id and i.status = 'attending'
  join public.menus mn on mn.event_id = i.event_id and mn.status = 'published'
  join public.courses c on c.menu_id = mn.id and c.requires_choice
  where g.household_id = h.id
    and exists (select 1 from public.dishes d where d.course_id = c.id and d.archived_at is null)
    and not exists (
      select 1 from public.meal_selections ms where ms.guest_id = g.id and ms.course_id = c.id
    )
) m on true
where public.is_staff();

revoke all on public.household_rsvp_progress from public, anon;
grant select on public.household_rsvp_progress to authenticated, service_role;
