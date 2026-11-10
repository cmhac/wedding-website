# 0013: Placeholder homepage

Status: accepted (the couple confirmed on 2026-11-09)

This repository now builds one placeholder homepage at `/`, because
`hannahandchris.wedding/` answered "not found" and the couple want to show that
production deployments and the real sign-in flows work before the designer's
guest-facing site exists. The full plan is in
[`specs/004-placeholder-homepage`](../../specs/004-placeholder-homepage/plan.md).

## Decisions

- **A narrow, permanent exception to "no guest-facing screens".** The page and
  its sign-in prompt are built here. Every other guest-facing screen (the rest of
  the public site and the RSVP) and email content stay out of scope, and the
  exception is not a precedent. The designer may replace or build on the page.
  `CLAUDE.md`, `README.md` and `docs/architecture.md` say so.
- **Plain CSS, no design system.** The page has its own route group `(site)`
  with its own root layout and one stylesheet, as the admin console does
  ([0009](./0009-admin-console-v0.md)), and no theming library. The constitution's
  "Tailwind CSS" stack entry is for the designer's screens; this is a recorded
  departure for the two plain pages, to be revisited if the designer takes the
  page over.
- **One sign-in prompt for guests and staff.** One typed address, one neutral
  answer ("If that address is on the guest list or belongs to a staff account, a
  link is on its way.") and the same response time for every address. A household
  address gets the household link; otherwise Supabase is asked for a staff link,
  which only sends when a staff account exists. This relies on staff addresses
  never being household addresses ([0012](./0012-shared-household-access.md)).
- **Where people land.** Guests land on `/` until the RSVP page exists (the
  default for `GUEST_RSVP_PATH` changes from `/rsvp` to `/`); staff land on the
  admin console, which gains a sidebar item that opens `/` in a new tab.
- **Guest sign-out ends only this device.** Supabase's `signOut()` defaults to
  ending every session of the user, and a household is one shared user, so the
  route now asks for the local scope.

Alternatives: a top-level app layout (would impose a layout on the designer); a
"Staff sign in" link (declined); a database function to look up staff addresses
(unneeded because staff and household addresses never overlap).
