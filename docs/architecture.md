# Architecture

Status: planning. Nothing below is built yet. The first feature is specified in
[`specs/001-guest-data-model`](../specs/001-guest-data-model/plan.md); its plan
records answers to all seven decisions below, accepted on 2026-10-19.

## Goals

- Public wedding website (details, schedule, travel, registry, etc.), designed and built by the couple's designer. This repository covers the backend, exposed through a guest API and an admin API. It builds no public or guest-facing screens or visual components. There are two exceptions: a placeholder homepage at `/` (a plain sign-in prompt and a "Coming soon" page, a permanent, narrow exception recorded in [`docs/decisions/0013-placeholder-homepage.md`](./decisions/0013-placeholder-homepage.md)), a barebones placeholder save the date page at `/save-the-date` ([`docs/decisions/0015-save-the-date-outreach.md`](./decisions/0015-save-the-date-outreach.md)), and a minimal, temporary v0 admin console for staff ([`specs/002-admin-console-v0`](../specs/002-admin-console-v0/plan.md)), which uses those same APIs
- RSVP management for guests, and an admin interface for Chris and Hannah and their planner (a minimal v0 console is built here; the designer's screens replace it later)
- Guest communications (invitations, reminders, updates) by email
- Magic-link sign-in for everyone: the couple (admin) and guests

## Components

| Concern                                                                          | Tool                                                                                                                                                                 | Lives in                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Frontend                                                                         | Next.js, React; Tailwind for the designer's screens. Only the temporary v0 admin console and the placeholder homepage are built here, each with one plain stylesheet | `src/app`, `src/components`             |
| Database, auth, API                                                              | Supabase                                                                                                                                                             | `supabase/`, `src/lib/supabase`         |
| Backend logic                                                                    | Next.js server code and/or Supabase Edge Functions                                                                                                                   | `src/app`, `supabase/functions`         |
| Email content and design                                                         | Supplied separately (React Email suggested)                                                                                                                          | `emails/`                               |
| Email delivery                                                                   | Resend                                                                                                                                                               | `src/lib/email`                         |
| Save the date: landing, calendar file and links, staff-marked consent, readiness | Message-specific landing, one details record, one staff consent function (decision 0015)                                                                             | `src/lib/calendar`, `src/lib/campaigns` |
| Text delivery and wording                                                        | Twilio, off and hidden until configured (decision 0014); wording registered like emails                                                                              | `src/lib/sms`, `texts/`                 |

## Decisions

Each is recorded as a file in `docs/decisions/`. The answers are in
`docs/decisions/0002`–`0008`, accepted by the couple on 2026-10-19.

1. **Hosting.** _(accepted: 0002)_ The portfolio site is a static export on GitHub Pages. This site
   uses server-side auth cookies, so it likely needs a host that runs Next.js
   server code. `next.config.ts` deliberately does not set `output: "export"`.
2. **Guest identity model.** _(accepted: 0003, superseded by 0011)_ Guests sign in by personal link or a link emailed to any household address; each household has one Auth user with a synthetic, never-mailed address (0011). The original options follow. Guests sign in by magic link. Options: create a
   Supabase user per invited guest ahead of time and call `signInWithOtp` with
   `shouldCreateUser: false`, or allow open sign-up and match by email. This
   affects the `[auth]` settings in `supabase/config.toml`, which are still the
   CLI defaults.
3. **Auth emails through Resend.** _(accepted: 0004)_ Supabase sends magic-link emails itself. To
   send them (and their designs) through Resend, configure custom SMTP under
   `[auth.email.smtp]` or use an auth email hook. The hook is the long-term
   choice (the emails must match the site and be coded in this repository);
   custom SMTP runs in production only as a stopgap until the template exists.
4. **Where email sends run.** _(accepted: 0005)_ Next.js route handlers vs. Supabase Edge Functions
   (the latter suit database-triggered sends).
5. **Household/party model.** _(accepted: 0006; the one-responder part superseded by 0012)_ One invite per household vs. per person, plus-ones,
   per-event invitations. A household can have several addresses and anyone signed in to it can answer (0012).
6. **Sending domain.** _(accepted: 0007)_ Needs DNS verification in Resend before production sends.
7. **Admin authorization.** _(accepted: 0008)_ How Chris and Hannah are distinguished from guests
   (e.g. a roles table checked by row-level security policies).
