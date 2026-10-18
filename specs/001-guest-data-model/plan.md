# Implementation Plan: Guest, Invitation, and Communication Data Model

**Branch**: `ccr-ed2f4b54-3hd6vb` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-guest-data-model/spec.md`

## Summary

Build the database, access rules, server logic, and email pipeline behind the guest list, per-event invitations, RSVPs, menus and dietary needs, and invitation/reminder sends. **Scope: backend only.** This plan builds no screens and no visual components of any kind: not the public site, not guest-facing screens, and not admin screens. The designer (or whoever builds the screens) works against two documented interfaces this plan provides: a guest API and an admin API.

The approach: one Postgres schema in Supabase, with row-level security as the access control. Guests are pre-created Supabase Auth users (one per household, signing in by magic link). Staff (Chris, Hannah, the planner) are Auth users listed in a `staff` table. Guests write only through `SECURITY DEFINER` functions that enforce deadlines. All email sending, scheduled dispatch, and Resend webhooks run as Next.js route handlers, so templates, send logic, and tests share one runtime. There are no Edge Functions. This plan resolves the open decisions in `docs/architecture.md` (recorded as proposed in `docs/decisions/`).

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), Node 26 (`.nvmrc`), SQL (Postgres 17 per `supabase/config.toml`)

**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/ssr` and `@supabase/supabase-js`, `resend`, `@react-email/components`, `zod`, Tailwind CSS 4 (in the repository's stack, but this feature builds no UI, so it is unused here). No new runtime dependencies are planned. A CSV parser for the import is the only likely addition.

**Storage**: Supabase Postgres with row-level security, migrations in `supabase/migrations/`, DB tests in `supabase/tests/` (pgTAP via `supabase test db`)

**Testing**: Jest + React Testing Library for app code (including route handlers and the audience-filter schema); pgTAP for schema, RLS policies, and RPCs, per Constitution I and II

**Target Platform**: Node-capable host for Next.js server code, with Supabase cloud (production) and local Supabase via Docker (development). See [research.md](./research.md) R1 on hosting.

**Project Type**: Web application (single Next.js project plus Supabase directory; no separate backend project)

**Performance Goals**: Not performance-bound. ~150 guests, ~50 households, ~6 events. The user-facing targets are the spec's success criteria (SC-001, SC-002, SC-008).

**Constraints**: Guest data never logged. Secrets server-only. Sends are idempotent. Resend webhooks are at-least-once and may arrive out of order. The auth email rate limit applies unless custom SMTP or the auth email hook is configured.

**Scale/Scope**: ~10 tables of core data, ~6 supporting tables, ~8 RPCs, ~13 route handlers (admin, internal, and webhook), 7 guest API endpoints, 5 plain email templates (save-the-date, invitation, two reminders, update) plus the magic-link auth email. No screens.

## Constitution Check

_Gate: passed before Phase 0; re-checked after Phase 1 design._

| Principle                                      | Status | How the plan satisfies it                                                                                                                                                                                                         |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Test-first                                  | Pass   | `tasks.md` will order every task test-first. pgTAP tests precede each migration; Jest tests precede each route handler, with success and error paths.                                                                             |
| II. Schema by migration, RLS everywhere        | Pass   | Every table in [data-model.md](./data-model.md) has RLS enabled, a stated policy per role (anonymous, guest, staff), and a pgTAP test proving what each role can and cannot do. `src/types/database.ts` is generated.             |
| III. Secrets and guest data stay protected     | Pass   | Service-role key and Resend key stay in route handlers. Webhook and hook secrets are server-only. The audit log and message events store no names, emails, or dietary values. Seeds use fake data.                                |
| IV. One repository                             | Pass   | Schema, tests, templates, send logic, import script, and docs all live in this repo. Dashboard-only settings (auth hook URL, Resend webhook, DNS) are listed in [quickstart.md](./quickstart.md) and to be documented in `docs/`. |
| V. Current tooling, recorded decisions         | Pass   | No new tool versions pinned. All open decisions are written up as `docs/decisions/0002`–`0008` (status: proposed until the couple confirm).                                                                                       |
| Stack section: no silent open-decision choices | Pass   | Each open decision (hosting, guest identity, auth emails, send location, household model, sending domain, admin authorization) is resolved explicitly in research.md and a decision record.                                       |

No violations; the Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-guest-data-model/
├── plan.md              # This file
├── research.md          # Phase 0: decisions with rationale and sources
├── data-model.md        # Phase 1: tables, relationships, RLS, state machines
├── quickstart.md        # Phase 1: how to validate end to end
├── contracts/
│   ├── database-rpc.md       # Guest-facing and staff RPCs
│   ├── guest-api.md          # HTTP interface for the guest frontend
│   ├── admin-api.md          # Direct-access and HTTP interface for the admin frontend
│   ├── http-endpoints.md     # Route handlers and webhooks
│   └── audience-filter.md    # Recipient-selection schema for sends
├── checklists/requirements.md
└── tasks.md             # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── config.toml                 # signups off; auth hook; cron settings
├── migrations/                 # one migration per concern (see data-model.md)
├── tests/                      # pgTAP: schema, rls, rpc, views
└── seed.sql                    # fake households, events, menu, staff

src/
├── app/
│   ├── auth/callback/route.ts  # completes sign-in; redirects staff to /admin, guests to /rsvp (paths served by the screen builders)
│   └── api/
│       ├── guest/              # guest API (contracts/guest-api.md)
│       ├── admin/              # sign-in, households, import, send, exports, staff (contracts/admin-api.md)
│       ├── auth/send-email/route.ts            # Supabase "Send Email" hook
│       ├── webhooks/resend/route.ts            # delivery events
│       └── internal/dispatch-scheduled/route.ts# called by pg_cron
├── lib/
│   ├── supabase/               # browser, server, middleware, admin (service-role) clients
│   ├── email/                  # Resend client, send helpers, webhook verification
│   ├── campaigns/              # audience schema, dispatch, status ranking
│   ├── guests/                 # import parsing and validation
│   ├── guest-api/              # zod schemas and typed client for the guest API
│   ├── admin-api/              # zod schemas and typed client for the admin API
│   └── exports/                # csv builders
└── types/database.ts           # generated

emails/                         # React Email templates: magic-link, save-the-date, invitation, reminder, update
scripts/                        # import-guests, create-staff-user, guest-api-smoke
docs/decisions/                 # 0002–0008 for the decisions in research.md
```

**Structure Decision**: No screens are created by this plan: the public site, guest-facing screens (including whatever serves `/rsvp`), and admin screens (including whatever serves `/admin`) are all out of scope, so there is no `src/components` work and no page under `src/app` beyond route handlers. Single Next.js project with `supabase/` beside it, as already laid out in `CLAUDE.md`. No separate backend, because Next.js route handlers cover every server need and keep email code in the same runtime as the templates.

## Complexity Tracking

No constitution violations to justify.
