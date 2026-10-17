# Architecture

Status: planning. Nothing below is built yet.

## Goals

- Public wedding website (details, schedule, travel, registry, etc.)
- RSVP management for guests, and an admin view for Chris and Hannah
- Guest communications (invitations, reminders, updates) by email
- Magic-link sign-in for everyone: the couple (admin) and guests

## Components

| Concern             | Tool                                               | Lives in                        |
| ------------------- | -------------------------------------------------- | ------------------------------- |
| Frontend            | Next.js, React, Tailwind                           | `src/app`, `src/components`     |
| Database, auth, API | Supabase                                           | `supabase/`, `src/lib/supabase` |
| Backend logic       | Next.js server code and/or Supabase Edge Functions | `src/app`, `supabase/functions` |
| Email design        | React Email                                        | `emails/`                       |
| Email delivery      | Resend                                             | `src/lib/email`                 |

## Open decisions

Record each as a file in `docs/decisions/` once settled.

1. **Hosting.** The portfolio site is a static export on GitHub Pages. This site
   uses server-side auth cookies, so it likely needs a host that runs Next.js
   server code. `next.config.ts` deliberately does not set `output: "export"`.
2. **Guest identity model.** Guests sign in by magic link. Options: create a
   Supabase user per invited guest ahead of time and call `signInWithOtp` with
   `shouldCreateUser: false`, or allow open sign-up and match by email. This
   affects the `[auth]` settings in `supabase/config.toml`, which are still the
   CLI defaults.
3. **Auth emails through Resend.** Supabase sends magic-link emails itself. To
   send them (and their designs) through Resend, configure custom SMTP under
   `[auth.email.smtp]` or use an auth email hook.
4. **Where email sends run.** Next.js route handlers vs. Supabase Edge Functions
   (the latter suit database-triggered sends).
5. **Household/party model.** One invite per household vs. per person, plus-ones,
   per-event invitations.
6. **Sending domain.** Needs DNS verification in Resend before production sends.
7. **Admin authorization.** How Chris and Hannah are distinguished from guests
   (e.g. a roles table checked by row-level security policies).
