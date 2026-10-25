# Implementation Plan: Admin Console v0

**Branch**: `ccr-148acb64-gkxwqr` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-admin-console-v0/spec.md`

## Summary

Build a deliberately plain admin console at `/admin` for the couple and the planner, on top of the admin API and staff data access that already exist. It covers sign-in, an overview, households and guests (with CSV or Excel import), events and invitations, answering on a household's behalf, menus and dietary data, campaigns and delivery status, reports and exports, history, settings, and staff access. Its job is to let the team exercise every admin capability before the creative director's design arrives, and to surface gaps in the data layer.

**Scope change.** This feature supersedes the repository's "backend only, build no screens" rule **for admin screens only**. Guest-facing screens (public site, RSVP) and email content stay out of scope. The rule is rewritten in the same change (spec FR-033).

The approach, from [research.md](./research.md):

- Pages live in a `(admin)` route group with its own root layout, so nothing is imposed on the designer's public site (R1).
- Pages are thin: an async page loads a screen-shaped object from `src/lib/admin/` and hands it to synchronous presentational components in `src/components/admin/`. Every page and action checks the staff session itself, and row-level security remains the real gate (R2, R10).
- Reads run in Server Components under the staff session. Direct-access writes are Server Actions. The seven operations that need the server secret keep using the existing route handlers through the existing typed wrappers (R3).
- Tabs and confirmation steps are URL query values, and the phone menu is a `<details>` element, so there is almost no client state (R4).
- One responsive stylesheet with named tokens, ported from the wireframes, using semantic class names. The creative director's v1 replaces the stylesheet; page markup and behavior tests do not change (R5).
- Excel is read on the server with one new dependency, `read-excel-file`, and goes through the unchanged CSV validation (R6).
- Every time is Pacific, through one helper (R7). Every answer shows who gave it, through one set of rules (R8).
- **No migrations and no new database objects.**

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node 26 (`.nvmrc`)

**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/ssr` and `@supabase/supabase-js`, `zod` 4, `csv-parse` (existing). One addition: `read-excel-file` ^9.3.12 (R6). Tailwind stays installed but unused by the admin console (R5).

**Storage**: Supabase Postgres, unchanged. No new tables or migrations. See [data-model.md](./data-model.md) for the screen objects and the gaps found.

**Testing**: Jest with React Testing Library, per the constitution. Synchronous components, data functions, server actions, the time helper, the attribution rules, the spreadsheet conversion, and the changed import route are all tested. Async pages are not covered by Jest (a documented limitation) and are covered by the written walkthrough in [quickstart.md](./quickstart.md) (R10). The database tests (`supabase test db`) are unchanged.

**Target Platform**: Vercel (decision 0002) for the app; Supabase cloud and local Supabase for data. Desktop browsers first; phone width supported through the same pages.

**Project Type**: Web application (single Next.js project with `supabase/` beside it), as before.

**Performance Goals**: Not performance-bound. A few hundred households and about a thousand guests at most. The user-facing targets are the spec's success criteria (SC-002, SC-003, SC-005).

**Constraints**: Guest data is never logged (use `src/lib/log.ts`, codes only). The service-role key is never imported by pages, actions or components. Import uploads stay under the 2 MiB cap, which sits under Vercel's documented 4.5 MB request limit (R6). Pacific time everywhere (R7). Presentation is replaceable without touching behavior (FR-029, SC-008).

**Scale/Scope**: 11 screens (see [contracts/admin-routes.md](./contracts/admin-routes.md)), about 25 server actions, 3 new client wrappers, 1 changed route handler, 1 new dependency, 2 decision records, rewrites of the scope text in `CLAUDE.md` and the docs.

## Constitution Check

_Gate: passed before Phase 0; re-checked after Phase 1 design._

| Principle                                  | Status                   | How the plan satisfies it                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Test-first                              | Pass, with a limit       | `tasks.md` will order every task test-first (the failing test, then the code). Async Server Components cannot be rendered by Jest, so pages stay thin and all behavior lives in tested functions and components (R10). The limit and the walkthrough that covers it are written down.                                      |
| II. Schema by migration, RLS everywhere    | Pass                     | No schema change, so no migration and nothing new to protect. Every console read and write runs under the staff member's own session, so existing policies and their database tests apply unchanged. If the couple later chooses the attribution migration (gap G2), it follows this principle with its own database test. |
| III. Secrets and guest data stay protected | Pass                     | Pages, actions and components use the session client only. The service-role key stays in the existing route handlers, called through wrappers. Data modules are marked server-only. Nothing logs names, emails, or addresses; fixtures and the seed use fake data. Error messages never repeat cell values.                |
| IV. One repository                         | Pass                     | Pages, styles, actions, tests, decision records, and the wireframes under `specs/002-admin-console-v0/design/` all live here. `CLAUDE.md` and the docs are updated in the same change.                                                                                                                                     |
| V. Current tooling, recorded decisions     | Pass                     | One new dependency at its newest release, chosen and recorded (R6, decision 0010). The scope and approach are recorded in decision 0009 (R13).                                                                                                                                                                             |
| Stack: Tailwind CSS                        | **Departure, justified** | The admin console uses one plain stylesheet instead of Tailwind utility classes. Recorded in Complexity Tracking and decision 0009.                                                                                                                                                                                        |
| Stack: choices beyond the list             | Pass                     | The open choices this feature touches (page structure, styling, Excel library) are resolved explicitly in research.md. Nothing is assumed silently.                                                                                                                                                                        |
| Governance: `CLAUDE.md` consistent         | Pass once tasks done     | `CLAUDE.md` currently forbids screens. The constitution says it must stay consistent, so rewriting its Scope and Layout sections is a task in this feature and part of its definition of done (FR-033).                                                                                                                    |

**Post-design re-check.** The Phase 1 design adds no database object, no secret handling beyond the existing wrappers, and no dependency beyond the one recorded. All rows above still hold.

### Open decision for the couple

**Meal attribution after a staff member leaves (gap G2).** The console can show a meal choice's source from the data that exists, but for rows written by a staff member who is later removed it will say "Unknown". A small additive migration (an `actor_kind` column on `meal_selection_history`, plus a database test) would make it exact. It is not in this plan's tasks. Say if you want it added; it is a few tasks.

## Project Structure

### Documentation (this feature)

```text
specs/002-admin-console-v0/
├── plan.md                  # This file
├── research.md              # Phase 0: decisions with reasons and sources
├── data-model.md            # Phase 1: screen objects, attribution rules, gaps
├── quickstart.md            # Phase 1: validation walkthrough
├── contracts/
│   ├── admin-routes.md      # Pages, what each reads, actions, guards
│   └── import-excel.md      # The one change to a route handler
├── design/                  # Wireframes (desktop and phone), kept as exported
├── checklists/requirements.md
├── spec.md
└── tasks.md                 # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (admin)/                          # route group: its own root layout
│   │   ├── layout.tsx                    # <html>, <body>, imports admin.css
│   │   ├── admin.css                     # the one stylesheet; tokens at the top
│   │   ├── auth/error/page.tsx           # shared failure page for sign-in links
│   │   └── admin/
│   │       ├── sign-in/page.tsx          # public
│   │       └── (console)/                # everything below needs a staff session
│   │           ├── layout.tsx            # shell: sidebar or phone menu, who is signed in
│   │           ├── page.tsx              # overview
│   │           ├── households/{page.tsx, new/page.tsx, [id]/page.tsx}
│   │           ├── import/page.tsx
│   │           ├── events/page.tsx
│   │           ├── menus/page.tsx
│   │           ├── campaigns/page.tsx
│   │           ├── reports/page.tsx
│   │           ├── history/page.tsx
│   │           └── settings/page.tsx
│   └── api/admin/guests/import/route.ts  # CHANGED: also reads .xlsx (contracts/import-excel.md)
├── components/admin/                     # synchronous presentational components + the few client forms
│   ├── (Shell, PageHeader, Card, StatTile, Badge, TabLinks, DataTable, Field, Alert, ConfirmPanel, AnsweredBy, ...)
│   └── forms/ (household, import, send campaign, staff, sign-in: client components using the wrappers)
├── lib/
│   ├── admin/                            # data functions, server actions, helpers (all with __tests__)
│   │   ├── session.ts                    # requireStaffPage / getStaffForShell
│   │   ├── time.ts                       # Pacific display and entry conversion
│   │   ├── attribution.ts                # AnsweredBy rules (research R8)
│   │   ├── messages.ts                   # every error code -> plain words
│   │   ├── data/{overview,households,events,menus,campaigns,reports,history,settings}.ts
│   │   └── actions/{households,guests,answers,events,menus,campaigns,settings,session}.ts
│   ├── admin-api/client.ts               # CHANGED: + requestStaffSignIn, importGuestsFile, sendCampaign, grantStaff, revokeStaff
│   ├── admin-api/schemas.ts              # CHANGED: importResponse gains `source`
│   └── guests/spreadsheet.ts             # NEW: .xlsx to the CSV text the importer already takes
docs/
├── decisions/0009-admin-console-v0.md    # NEW
├── decisions/0010-excel-library.md       # NEW
├── admin-api.md                          # CHANGED: remove "no user interface"; import accepts .xlsx
├── architecture.md                       # CHANGED: scope statements
CLAUDE.md                                 # CHANGED: Scope and Layout sections (FR-033)
README.md                                 # CHANGED if it states the old scope
.env.example                              # CHANGED: NEXT_PUBLIC_ADMIN_TIME_ZONE
package.json                              # CHANGED: read-excel-file
.github/workflows/ci.yml                  # no edit needed: the build step turns on by itself once pages exist
```

**Structure Decision.** One Next.js project, as already laid out in `CLAUDE.md`. The admin console is added in a route group so it does not claim the site's root layout. Components go in `src/components/admin/` (that directory is currently empty). All logic that can be tested without rendering an async component goes in `src/lib/admin/`. Wireframes stay in the spec folder as the visual reference; the real stylesheet is derived from them, and v1 replaces it.

## Complexity Tracking

| Departure                                                                           | Why needed                                                                                                                                                                 | Simpler alternative rejected because                                                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plain stylesheet with tokens instead of Tailwind utilities for the admin console    | The look is throwaway and must be replaceable by swapping one file (FR-029, SC-008). Semantic class names plus variables make that a one-file change with no markup edits. | Tailwind utility classes would spread the styling through every component, so a restyle would touch each one and could change behavior tests that find elements by class.  |
| Two ways to write (Server Actions and the existing route handlers through wrappers) | The route handlers need the server secret and already hold tested logic. Direct-access writes need no secret and are simplest as Server Actions.                           | Wrapping every write in a new route handler duplicates tested logic. Moving the secret-key operations into Server Actions would rewrite and retest working, reviewed code. |
