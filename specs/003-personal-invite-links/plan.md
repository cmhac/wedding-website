# Implementation Plan: Personal invite links and shared household sign-in

**Branch**: `003-personal-invite-links` (work happens on the session branch) | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-personal-invite-links/spec.md`

## Summary

Guests reach their RSVP by tapping a personal link in their invitation email; every email address in a household gets the invitation and reaches the same shared RSVP; guests stay signed in indefinitely; sign-in, invitation and reminder emails come from templates in this repository. Text messages are deferred to a later feature.

Technical approach (details in [research.md](./research.md)): Supabase Auth stays the sign-in system with one Auth user per household, now given a synthetic never-mailed address. A thin layer in the site maps a personal link or a typed address to the household, asks Supabase for a sign-in token with `generateLink`, and exchanges it for a session on the server. Personal links are derived from the household id, a per-household version and a server secret, so they can be re-sent and copied but never stored. Addresses move from one column into a `household_contacts` table; campaigns send one email per address. "Sign out everywhere" deletes the household's Supabase sessions and guest access checks that the session still exists. Guest sign-in emails are sent by the site through Resend; staff sign-in emails go through the Send Email hook, which replaces the temporary custom SMTP setup.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 24+ (`.nvmrc`); SQL (Postgres, Supabase)

**Primary Dependencies**: Next.js 16 (App Router route handlers), `@supabase/supabase-js` and `@supabase/ssr`, Resend, React Email (`@react-email/components`), zod. No new dependencies; HMAC and hashing use Node's built-in `crypto`.

**Storage**: Supabase Postgres; one new table (`household_contacts`), one internal table (`sign_in_attempts`), changes to `households`, `settings` and `messages`

**Testing**: Jest and React Testing Library (route handlers, helpers, admin components, templates); pgTAP database tests (`npm run test:db`) for schema, row-level security and functions

**Target Platform**: Vercel (Next.js server code) and Supabase (hosted Postgres and Auth)

**Project Type**: web application: backend route handlers, database, and the temporary admin console; guest-facing screens are built separately by the designer

**Performance Goals**: one tap from the invitation to the RSVP in under 30 seconds (SC-001); sign-in answers identical in content and within 250 ms of each other for known and unknown addresses (SC-004)

**Constraints**: no guest-facing screens; no addresses or links in logs; guest access ends on the next request after "sign out everywhere"; no gap in sign-in email delivery during the hook switch-over (FR-026)

**Scale/Scope**: a wedding guest list (low hundreds of households, a few addresses each); imports up to 5,000 rows as today

## Constitution Check

_GATE: checked before research and again after design._

| Principle                                | Status                        | How                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Test-first                            | Pass                          | Every migration has pgTAP tests written first (including what a guest cannot do); route handlers and helpers get Jest tests for success and error paths before code; the ~24 database test files that use `contact_email` are changed before the column is dropped.                                  |
| II. Schema by migration, RLS everywhere  | Pass, with one justified item | New tables have RLS (`household_contacts` with guest-read-own and staff policies; `sign_in_attempts` with no policies, function access only). `src/types/database.ts` is regenerated, not edited. One security-definer function deletes rows in Supabase's `auth.sessions`: see Complexity Tracking. |
| III. Secrets and guest data              | Pass                          | New `INVITE_LINK_SECRET` is server-only, documented by name in `.env.example`, stored as a sensitive Vercel variable. Addresses are masked for guests, hashed in `sign_in_attempts`, never logged; fixtures use fake addresses. Real addresses leave `auth.users` entirely (research R2).            |
| IV. One repository                       | Pass                          | Templates are code in `emails/`; dashboard steps (hook switch-over, SMTP removal, session settings) are documented in `docs/manual-setup.md`.                                                                                                                                                        |
| V. Current tooling, recorded decisions   | Pass                          | No new dependencies. Two decision records supersede the guest-identity and household decisions; the auth-emails decision gets a dated note (research R14).                                                                                                                                           |
| Stack: "magic-link sign-in for everyone" | Pass                          | Personal links and typed-address links are both magic links; staff are unchanged.                                                                                                                                                                                                                    |
| Stack: no silent open-decision choices   | Pass                          | Hosting, send location, household model and admin authorisation are already recorded; the household model change is recorded explicitly.                                                                                                                                                             |
| Scope: email content                     | Pass, by exception            | First-draft templates are written under the couple's dated exception in `CLAUDE.md`; no visual design.                                                                                                                                                                                               |

Re-check after design: unchanged. No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-personal-invite-links/
├── spec.md
├── plan.md              # this file
├── research.md          # decisions R1 to R14
├── data-model.md        # schema changes and functions
├── quickstart.md        # validation guide
├── contracts/
│   ├── guest-api.md     # new routes and response additions
│   ├── admin-api.md     # contact, link and sign-out routes; console changes
│   └── email-templates.md
├── checklists/requirements.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source code (repository root)

```text
supabase/
├── migrations/          # new: household contacts (with data move and column drop), invite links and settings,
│                        #      session check and revoke function, sign-in attempts, per-contact messages
└── tests/database/      # new test files per migration; existing files updated off contact_email

src/
├── app/
│   ├── i/[token]/route.ts            # new: open a personal link
│   ├── auth/confirm/route.ts         # new: complete a typed-address link
│   ├── auth/callback/route.ts        # unchanged (staff)
│   ├── api/guest/sign-in/route.ts    # changed: look up contacts, generate and send the link
│   ├── api/guest/rsvp/route.ts       # changed: contacts (masked), deadline_passed
│   ├── api/auth/send-email/route.ts  # unchanged code; now carries staff email only
│   ├── api/admin/households/...      # changed create and patch; new contacts, invite-link, sign-out routes
│   ├── api/admin/staff/route.ts      # changed: refuse household-contact addresses
│   └── (admin)/admin/(console)/...   # household detail, list, import help, settings, overview warning
├── components/admin/                 # contacts list and form, link and sign-out controls (replace ContactEmailForm)
├── lib/
│   ├── auth/invite-link.ts           # new: derive and check tokens (HMAC, versions)
│   ├── auth/household-session.ts     # new: generateLink plus verifyOtp, shared by /i and /auth/confirm
│   ├── auth/sign-in-limits.ts        # new: address hashing and the database limiter
│   ├── guests/household-access.ts    # changed: synthetic Auth user per household; contacts, not one email
│   ├── guests/import.ts              # changed: contact_email_N columns
│   ├── campaigns/                    # changed: per-contact enqueue and props (personal_link)
│   ├── email/templates.ts            # changed: CampaignProps.personal_link
│   └── guest-api, admin-api          # changed schemas and clients
└── types/database.ts                 # regenerated

emails/                               # new first drafts: magic-link, invitation, rsvp-reminder; registered in index.ts
scripts/convert-household-accounts.ts # new: one-off, only if households exist before deploy
docs/                                 # guest-api.md, admin-api.md, manual-setup.md, two new decision records, 0004 note
```

**Structure Decision**: the existing single Next.js app and Supabase project; new code goes in the directories `CLAUDE.md` already defines. The two new top-level routes (`/i/[token]`, `/auth/confirm`) are route handlers with no screens, alongside the existing `/auth/callback`.

## Delivery order

Each step is releasable with the suite green; migrations are additive until the step that drops `contact_email`.

1. **Verify-first checks** (research R1, R2, R10) in local tests.
2. **Contacts**: `household_contacts`, data move, triggers and RLS; household access helpers and admin routes move to contacts; importer columns; tests updated off `contact_email`; then drop the column.
3. **Synthetic household accounts**: every household gets an Auth user at creation; conversion script.
4. **Personal links**: token helper, `/i/[token]`, `invite_links_open()`, wedding event setting, reissue route.
5. **Typed-address links**: `sign_in_attempts` and limits, `/api/guest/sign-in` change, `/auth/confirm`.
6. **Sessions**: `revoke_household_sessions`, session check in `current_household_id()`, sign-out-everywhere route.
7. **Campaigns per address**: `messages.contact_id`, messaging functions, props, delivery flags.
8. **Templates**: first drafts and tests; register in `emails/index.ts`.
9. **Guest API additions**: `contacts`, `deadline_passed`.
10. **Admin console**: contacts, link and sign-out controls, settings, overview warning, preview counts.
11. **Docs and switch-over**: contracts, `docs/guest-api.md`, `docs/admin-api.md`, decision records, `docs/manual-setup.md` (hook on, then SMTP off).

## Complexity Tracking

| Item                                                                                                                  | Why needed                                                                                                                                        | Simpler alternative rejected because                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A security-definer function that deletes rows from Supabase's `auth.sessions`, and a guest-access check that reads it | "Sign out everywhere" must take effect on the next request (FR-007), and Supabase's admin sign-out needs a token from the device being signed out | Deleting and recreating the household's Auth user would erase who answered each RSVP (`on delete set null` references); waiting for tokens to expire leaves up to an hour of access |
| Dropping `households.contact_email` touches about 15 source files and 24 database test files                          | One place for a household's addresses (FR-001)                                                                                                    | Keeping a "primary" address beside a list leaves two sources of truth for every reader                                                                                              |
