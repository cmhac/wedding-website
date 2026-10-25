# Tasks: Admin Console v0

**Input**: Design documents from `/specs/002-admin-console-v0/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md, and the wireframes in `design/`

**Tests**: Required. Constitution Principle I (test-first) makes tests mandatory, so every group below starts with test tasks that must fail before the implementation task that makes them pass. Async pages cannot be rendered by Jest (research R10), so pages stay thin: all behavior lives in tested functions, actions and synchronous components, and the pages are covered by the quickstart walkthrough.

**Organization**: Tasks are grouped by user story so each can be built and tested on its own. User stories are numbered as in `spec.md` (US1 to US8).

**Scope**: This feature supersedes the old "no screens" rule **for admin screens only**. It builds no public site, no guest-facing screen (including the RSVP) and no email content. It adds **one small additive migration** (a nullable `actor_kind` column on the meal history table, so every meal choice shows exactly who made it) and no other database objects. The wireframes in `design/` are the visual reference and the plain stylesheet is the only styling.

**Decision made**: the couple chose to add the meal-attribution migration (plan.md, "Decision made"; research R8; gap G2). It reaches the hosted database by merging to `main`, never by a manual push (`AGENTS.md`, "How migrations reach the hosted database"), and the couple is asked before that merge (see the last Polish task). The database tasks need local Supabase running (`npm run db:start`, which needs Docker).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: Which user story the task belongs to
- Test files sit next to the code in `__tests__` and are named `{name}.test.ts(x)`. Route-handler and server-action tests start with `/** @jest-environment node */`, as the existing route tests do.
- Mock `next/cache` and `next/navigation` in action tests (`revalidatePath`, `redirect`). `redirect` throws, so assert on the thrown redirect.
- Behavior tests find elements by role and label, never by class name or style (so a v1 restyle cannot break them).
- Quote the constraints given in a task exactly; they come from `data-model.md` and `specs/001-guest-data-model/data-model.md`.

## Path Conventions

Single Next.js project, as in `plan.md`: pages under `src/app/(admin)/`, components in `src/components/admin/`, logic in `src/lib/admin/`, the changed import route under `src/app/api/admin/guests/import/`, docs under `docs/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, configuration, and bringing the repository's rules in line with this feature before anything is built.

- [ ] T001 Install the one new dependency with `npm install read-excel-file` (newest release, expected 9.3.x; Constitution V) and the test-only helper with `npm install --save-dev fflate` (used by the test workbook builder in T072); commit `package.json` and `package-lock.json`
- [ ] T002 [P] Add `NEXT_PUBLIC_ADMIN_TIME_ZONE=America/Los_Angeles` with a one-line comment ("Time zone every admin date and time is shown and entered in") to `.env.example`
- [ ] T003 [P] Write `docs/decisions/0009-admin-console-v0.md` (status: proposed until the couple confirms): the admin console is built here for admin screens only, superseding the "no screens" rule; pages in a `(admin)` route group with its own root layout; one plain responsive stylesheet with tokens instead of Tailwind utilities, and why; thin pages with Jest-testable logic and no end-to-end framework in v0; reads in Server Components and direct writes in Server Actions with the secret-key operations kept in the existing route handlers (research R1 to R5, R10)
- [ ] T004 [P] Write `docs/decisions/0010-excel-library.md` (status: proposed): `read-excel-file` chosen; the comparison table for `read-excel-file`, `exceljs` and `xlsx` and the open points from research R6, with the date they were checked (2026-10-25)
- [ ] T005 Rewrite the **Scope** and **Layout** sections of `CLAUDE.md` so they no longer forbid screens: admin screens exist under `src/app/(admin)` and `src/components/admin`, are temporary, and are separate from the designer's work; guest-facing screens and email content remain out of scope; add the new paths (`src/lib/admin`, `specs/*/design`) to the Layout table; keep the plain-English references rule and the other conventions as they are
- [ ] T006 [P] Update `docs/architecture.md`: replace the statements that no screens are built (Goals and the Frontend row of Components) with the admin-console exception, and link `specs/002-admin-console-v0`
- [ ] T007 [P] Update the "No user interface is provided" notice at the top of `docs/admin-api.md` (and the matching sentence in `specs/001-guest-data-model/contracts/admin-api.md`, since `docs/admin-api.md` is published from it and a contract test compares them) to say a minimal v0 admin console exists, is temporary, and uses these same interfaces; also correct the matching line in `README.md` if it states the old scope
- [ ] T008 [P] Confirm Jest can test a component that imports a stylesheet: add `src/components/admin/__tests__/smoke.test.tsx` that renders a trivial component importing a `.css` file with React Testing Library and asserts it renders; note in a comment at the top that `next/jest` mocks stylesheets automatically, so behavior tests cannot depend on styling (research R5); delete the smoke test once the first real component test exists

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The stylesheet, root layout, time helper, error messages, session guard, attribution rules, action helper and shared components that every story uses. No story can start until this phase is done.

**⚠️ CRITICAL**: Write each test first and watch it fail before writing the code that makes it pass.

### Stylesheet and layout

- [ ] T009 Write the test `src/app/(admin)/__tests__/admin-css.test.ts` (node environment): reads `src/app/(admin)/admin.css` and asserts every `var(--name)` it uses is defined in `:root`, and that `:root` defines at least these tokens: `--font`, `--bg`, `--surface`, `--surface-2`, `--border`, `--border-soft`, `--text`, `--muted`, `--accent`, `--accent-text`, `--focus`, `--ok-bg`, `--ok-text`, `--ok-border`, `--warn-bg`, `--warn-text`, `--warn-border`, `--bad-bg`, `--bad-text`, `--bad-border`, `--bad-solid`, `--radius`, `--radius-sm`, `--gap`, `--side-w` (so v1 can restyle by replacing values)
- [ ] T010 Create `src/app/(admin)/admin.css` by merging `specs/002-admin-console-v0/design/admin.css` and `design/mobile.css` into one responsive stylesheet: keep the tokens and class names (`.app`, `.side`, `.main`, `.card`, `.badge`, `.btn`, `.table`, `.tabs`, `.field`, `.alert`, `.stat`, and so on); below 900 px wide turn the sidebar into the top bar (`.m-top`) with the menu in a `<details>`; make `.table` rows stack as labelled cards on narrow screens using `td::before { content: attr(data-label) }`; keep the visible focus outline, 44 px touch targets on narrow screens, and 16 px form text on narrow screens (so phones do not zoom); run `npx prettier --write` on it; T009 must pass
- [ ] T011 Create the root layout `src/app/(admin)/layout.tsx`: `<html lang="en">` with `<body>`, imports `./admin.css`, exports `metadata` with the title "Wedding admin"; no `src/app/layout.tsx` is created (research R1)

### Time helper (research R7)

- [ ] T012 [P] Write tests `src/lib/admin/__tests__/time.test.ts` for the Pacific helper: `formatPacific(isoOrDate, { date, time, weekday })` shows "Sat, Jun 12, 4:00 PM PT" for a summer moment and "PT" for a winter moment, regardless of the machine's own time zone (set `process.env.TZ` to `Asia/Tokyo` in one test); `pacificLocalToIso("2027-06-12T16:00")` returns `2027-06-12T23:00:00.000Z` (daylight time) and `pacificLocalToIso("2027-12-12T16:00")` returns `2027-12-13T00:00:00.000Z` (standard time); `pacificLocalToIso("2027-03-14T02:30")` (a time skipped by the spring clock change) returns an error object with the message "That time does not exist on that date because the clocks change."; `pacificLocalToIso("2027-11-07T01:30")` (a time that happens twice) returns the first (daylight) occurrence `2027-11-07T08:30:00.000Z`; `isoToPacificLocal` round-trips back to the typed value; an empty string returns `null`; the zone comes from `NEXT_PUBLIC_ADMIN_TIME_ZONE` and defaults to `America/Los_Angeles`
- [ ] T013 Implement `src/lib/admin/time.ts` with `ADMIN_TIME_ZONE`, `formatPacific`, `pacificLocalToIso`, `isoToPacificLocal` using only `Intl.DateTimeFormat` (no new library); make T012 pass

### Error messages (spec SC-006)

- [ ] T014 [P] Write tests `src/lib/admin/__tests__/messages.test.ts`: `messageFor(code)` returns plain words for every code in the error table of `docs/admin-api.md` (`unauthenticated`, `forbidden`, `not_found`, `email_in_use`, `staff_account`, `last_couple`, `campaign_not_sendable`, `template_missing`, `invalid_audience`, `invalid_request`, `invalid_payload`, `invalid_file`, `rate_limited`, `server_error`) and for the console's own codes (`network`, `bad_response`, `unknown`) and the refusals the database raises directly (`allowance_below_named_plus_ones`, `duplicate_guest_name`, `invalid_meal`, `campaign_locked`, `invalid_status_transition`); a test reads the error table from `docs/admin-api.md` and fails if any code in it has no message; no message contains a stack trace, a table name or a raw SQL error; `messageFromDbError(error)` maps a Supabase error's message text to one of those codes and falls back to `server_error`
- [ ] T015 Implement `src/lib/admin/messages.ts` with `messageFor` and `messageFromDbError`; make T014 pass

### Session guard (research R2)

- [ ] T016 [P] Write tests `src/lib/admin/__tests__/session.test.ts` (node environment; reuse `src/lib/auth/__tests__/fakes.ts`): `requireStaffPage()` redirects to `/admin/sign-in` when there is no session; returns a "forbidden" result (not data) when the session is a guest; returns `{ user, role, supabase }` for a couple member and for a planner; `requireCouplePage()` returns forbidden for a planner; `getShellStaff()` returns the staff member's display name and role from the `staff` table, or null; staff status is read on every call (assert the `staff` table is queried each time, never cached across calls)
- [ ] T017 Implement `src/lib/admin/session.ts` (imports `server-only`) with `requireStaffPage`, `requireCouplePage`, `getShellStaff`, built on `getSession` from `src/lib/auth/session.ts`; make T016 pass

### Test fixture

- [ ] T018 Create `src/lib/admin/__tests__/fixtures/fake-db.ts`: reuse `createFakeDb` from `src/lib/campaigns/__tests__/fixtures/fake-db.ts` and extend it (in a way that keeps the campaign tests passing) with the query shapes this feature needs: `.order()`, `.in()`, `.ilike()`, `.range()`, `.single()`, `.maybeSingle()`, `.delete()`, `.update()` without a returned row, `.rpc()` with canned results and recorded calls, and an error injector (`failNext(table, { message })`); fake data only (example.test addresses, invented names); add `src/lib/admin/__tests__/fixtures/fake-db.test.ts` proving each shape

### Database change: who made each meal choice (research R8, gap G2)

- [ ] T019 Write the pgTAP test `supabase/tests/database/360-meal-history-actor-kind.test.sql`, following `340-archive-dish.test.sql` (begin, `\ir ../support/helpers.sql`, `tests.clear_data()`, `plan(n)`): the column `actor_kind` exists on `public.meal_selection_history`, type `text`, nullable, with a default that calls `current_actor_kind`; inserting a row with `actor_kind` `robot` fails the check (SQLSTATE 23514), and each of `couple`, `planner`, `guest`, `system` and null succeeds; a guest choosing a dish through the guest RPC writes a history row with `actor_kind` `guest` (use the call pattern in `320-meal-selections.test.sql`); `staff_set_meal` by a couple member writes `couple` and by a planner writes `planner`, including when `dish_id` is null (clearing a choice); `archive_dish` by a staff member writes that member's kind on every history row it creates (reason `dish_archived`); a guest declining writes reason `declined` with `guest`; a change made with nobody signed in writes `system`; `changed_by` is still recorded as before; **old rows stay empty**: inside the test drop the column, insert a history row, re-run the two `alter table` statements from the migration in the same order, then assert the old row's `actor_kind` is null and a new row gets the default (this proves the default is set after the column is added); row-level security is unchanged: staff can select `actor_kind`, a guest and anon get no rows or a permission error, and `authenticated` cannot insert, update or delete the table
- [ ] T020 Create the migration with `npx supabase migration new meal_history_actor_kind`: `alter table public.meal_selection_history add column actor_kind text check (actor_kind in ('couple', 'planner', 'guest', 'system'));` then, as a **separate statement afterwards**, `alter table public.meal_selection_history alter column actor_kind set default public.current_actor_kind();` (adding the column with the default in one statement would fill every existing row with `system`), plus a `comment on column` saying it records whether the account was a couple member, planner, guest or the system, and is empty for rows written before this migration; change no function and no other table (the functions that write meal history name their columns, so the default fills the new one); `public.current_actor_kind()` already exists in `supabase/migrations/20261019122751_audit_and_history.sql` and is executable by `authenticated` and `service_role`; T019 must pass
- [ ] T021 Run `npm run db:reset && npm run test:db` until the new test and the whole existing suite pass (including `710-planner`, `810-admin-direct-access` and `900-rls-coverage`, which touch this table), then run `npm run db:types` to regenerate `src/types/database.ts`; commit the generated file without hand edits
- [ ] T022 [P] Update `specs/001-guest-data-model/data-model.md` so the `meal_selection_history` entry lists `actor_kind` (nullable; `couple`, `planner`, `guest` or `system`; filled by the same helper as `rsvp_history`; empty for rows written before it was added)

### Attribution rules (research R8; spec FR-013a)

- [ ] T023 [P] Write tests `src/lib/admin/__tests__/attribution.test.ts` covering `answeredByForRsvp` and `answeredByForMeal` exactly as written in `data-model.md`, "Attributing answers": for an RSVP the newest `rsvp_history` row whose `new_status` equals the current status decides; for a meal the newest `meal_selection_history` row for the guest and course whose `new_dish_id` equals the current dish decides; in both, `actor_kind` `guest` gives `guest`; `couple` or `planner` gives `staff` with the name from `staff` where `staff.user_id = changed_by`, or `former_staff` if that person is gone (the kind is still known); `system` gives `system`; no history row gives `not_answered`; **a meal history row with an empty `actor_kind` (written before the migration)** falls back to comparing `changed_by` with the household's `auth_user_id` and the `staff` table: only the household account gives `guest`, only a staff match gives `staff`, both gives `shared_account`, neither gives `unknown`; a guest who changed their answer after staff recorded it shows `guest`, and the earlier staff step still shows in history rows
- [ ] T024 Implement `src/lib/admin/attribution.ts` exporting the `AnsweredBy` type (`guest`, `staff` with name, `former_staff`, `system`, `unknown`, `shared_account`, `not_answered`, each with an optional `at` time) and the two functions (`answeredByForMeal` takes the newest matching history row, the household's `auth_user_id` and the staff lookup); make T023 pass

### Action helper

- [ ] T025 [P] Write tests `src/lib/admin/actions/__tests__/shared.test.ts` (node environment) for `runAdminAction(schema, formData, handler)`: no session returns `{ ok: false, message }` with the "session ended" message and does not call the handler; a guest session returns the forbidden message; invalid input returns `{ ok: false, fieldErrors, values }` with plain-English field messages and the typed values kept; a handler that returns an error from Supabase is mapped through `messageFromDbError`; success calls `revalidatePath` for the paths the handler names and returns `{ ok: true }`; an unexpected throw returns the `server_error` message and logs only a code through `src/lib/log.ts`
- [ ] T026 Implement `src/lib/admin/actions/shared.ts` (`"use server"` helpers live in each action file; this file is plain TypeScript imported by them) with `runAdminAction`, the `ActionResult` type, and `formDataToObject`; make T025 pass

### Shared components (each: test first, then component)

- [ ] T027 [P] Write tests `src/components/admin/__tests__/primitives.test.tsx` for `PageHeader` (heading level 1, optional description, optional actions slot), `Card` (optional heading level 2), `StatTile` (number and label read together), `Badge` (visible text always present, variant is a prop, never colour alone), `Alert` (`role="alert"` for errors, `role="status"` for success and info), `EmptyState` (message shown), `Field` (a visible `<label>` bound to its control by `htmlFor`, hint linked with `aria-describedby`, error text linked and announced), and `TabLinks` (renders a `<nav aria-label>` with links, the current one has `aria-current="page"`, each link keeps the other query values)
- [ ] T028 Implement `src/components/admin/primitives.tsx` (`PageHeader`, `Card`, `StatTile`, `Badge`, `Alert`, `EmptyState`, `Field`, `TabLinks`) using the semantic class names from `admin.css`; make T027 pass
- [ ] T029 [P] Write tests `src/components/admin/__tests__/data-table.test.tsx` for `DataTable`: renders a real `<table>` with `<th scope="col">` headers, every `<td>` carries `data-label` equal to its column header (so the stylesheet can stack rows on phones), a `numeric` column is marked, an optional visually hidden header for the actions column, and an empty list renders `EmptyState`
- [ ] T030 Implement `src/components/admin/DataTable.tsx`; make T029 pass
- [ ] T031 [P] Write tests `src/components/admin/__tests__/shell.test.tsx` for `AdminShell`: renders `<nav aria-label="Main">` with the groups and links in `design/Overview.dc.html` (Overview, Households, Import, Events, Menus, Campaigns, Reports, History, Settings); the link for the current page has `aria-current="page"`; shows the signed-in person's name and role; the Sign out control is a button in a form; the phone menu is a `<details>` whose `<summary>` is a button named "Menu"; the main content is in `<main>`
- [ ] T032 Implement `src/components/admin/AdminShell.tsx` (synchronous; takes `current`, `staff` and `children`); make T031 pass
- [ ] T033 [P] Write tests `src/components/admin/__tests__/answered-by.test.tsx`: `AnsweredByBadge` shows "Guest" for `guest`; "Recorded by staff" plus the staff name and the time in Pacific (for example "Hannah, Oct 3, 2:14 PM PT") for `staff`; "Staff (former member)" for `former_staff`; "System" for `system`; "Unknown" for `unknown`; "Staff or household (same account)" for `shared_account`; "Not answered" for `not_answered`; the staff variant is visually and textually different from the guest variant
- [ ] T034 Implement `src/components/admin/AnsweredBy.tsx`; make T033 pass
- [ ] T035 [P] Write tests `src/components/admin/__tests__/confirm-panel.test.tsx` for `ConfirmPanel`: renders `role="alertdialog"` with a heading, a plain-English consequence sentence, a form whose submit button is the destructive action, and a Cancel link back to the page without the `confirm` query value; the optional "type the name to confirm" input is required and labelled
- [ ] T036 Implement `src/components/admin/ConfirmPanel.tsx`; make T035 pass
- [ ] T037 [P] Write tests `src/components/admin/__tests__/action-form.test.tsx` for `ActionForm`, a client component wrapping a server action with `useActionState`: shows the returned message in an `Alert`, shows each field error beside its field, keeps the values the person typed after a failure, disables the submit button while pending, and shows a success message when the action returns `ok`
- [ ] T038 Implement `src/components/admin/forms/ActionForm.tsx` (`"use client"`); make T037 pass
- [ ] T039 [P] Write tests `src/components/admin/__tests__/presentation-separation.test.ts` (node environment): scans every file under `src/components/admin` and `src/app/(admin)` and fails if any contains a Tailwind-style utility class list (for example `className="flex `) or an inline `style={{` that sets `color`, `background`, `font`, `margin`, `padding` or `border` (presentation belongs in `admin.css`, spec FR-029); and a second test that fails if any file under `src/components` or `src/app/(admin)` imports `@/lib/supabase/admin` or mentions `SUPABASE_SERVICE_ROLE_KEY` (Constitution III)
- [ ] T040 [P] Write the access-denied component test `src/components/admin/__tests__/access-denied.test.tsx` and implement `src/components/admin/AccessDenied.tsx`: heading "You do not have access to this", no data, a link to `/admin/sign-in`

**Checkpoint**: `npm run format:check && npm run lint && npm run type-check && npm test` all pass. User stories can now start.

---

## Phase 3: User Story 1 - Sign in and see where things stand (Priority: P1) 🎯 MVP

**Goal**: A staff member requests a sign-in link, follows it, and lands on an overview of answers per event and what households still owe. Signed-out visitors and guest accounts see nothing.

**Independent Test**: Quickstart steps 1 and 2: sign in as staff, confirm the overview numbers match the seed data, and confirm a guest account and a signed-out visitor cannot see it.

### Tests for User Story 1 (write first, they must fail)

- [ ] T041 [P] [US1] Add tests to `src/lib/admin-api/__tests__/client.test.ts` for a new `requestStaffSignIn(email)`: posts `{ email }` as JSON to `/api/admin/sign-in`; a 202 resolves `{ ok: true }`; a 429 resolves `{ ok: false, status: 429, error: { code: "rate_limited" } }`; a network failure resolves `{ ok: false, status: 0, error: { code: "network" } }`; it never throws
- [ ] T042 [P] [US1] Write tests `src/components/admin/__tests__/sign-in-form.test.tsx` for `SignInForm` (client component) with the wrapper mocked: a labelled "Email address" field; submitting shows the neutral message "If that address belongs to a staff account, a sign-in link is on its way." for a 202, and the **same** message text when the response is a 404-style or unknown-address response from the wrapper; a 429 shows the `rate_limited` message from `messages.ts`; the email stays in the field after an error
- [ ] T043 [P] [US1] Write tests `src/lib/admin/actions/__tests__/session.test.ts` (node environment) for `signOut`: calls `supabase.auth.signOut()` on the server client and redirects to `/admin/sign-in`; with no session it still redirects
- [ ] T044 [P] [US1] Write tests `src/lib/admin/data/__tests__/overview.test.ts` with the fake database: `loadOverview()` returns per-event `invited`, `attending`, `declined`, `pending` from `event_counts`, in event display order; `requiredOutstanding`, `optionalOutstanding` and `mealsOutstanding` count households whose `household_rsvp_progress.pending_required`, `pending_optional` and `pending_meals` are above 0; `deliveryProblems` counts households with `delivery_problem` true from `staff_households()`; `paperOnly` counts households with no `contact_email`; `possibleDuplicates` counts pairs from `find_duplicate_households()`; `householdCount` and the ceremony's attending total; `mostOutstanding` is the top three households by total outstanding; `rsvpOpen` and the default deadline come from `settings`
- [ ] T045 [P] [US1] Write tests `src/components/admin/__tests__/overview-view.test.tsx` for `OverviewView` (synchronous): headline stat tiles, the "Answers by event" table with Required or Optional badges, the "Needs follow-up" list with its links, "Most outstanding" rows linking to each household, "RSVPs are open" or "closed" with the default deadline in Pacific time, and an empty state when there are no events

### Implementation for User Story 1

- [ ] T046 [US1] Add `requestStaffSignIn` to `src/lib/admin-api/client.ts` (and its response handling to the shared `call` helper if needed); make T041 pass
- [ ] T047 [P] [US1] Create `src/components/admin/forms/SignInForm.tsx` (`"use client"`, uses `requestStaffSignIn`); make T042 pass
- [ ] T048 [P] [US1] Create `src/lib/admin/actions/session.ts` with the `signOut` server action; make T043 pass
- [ ] T049 [P] [US1] Create `src/lib/admin/data/overview.ts` (imports `server-only`) with `loadOverview()` returning `OverviewData` as in `data-model.md`; make T044 pass
- [ ] T050 [P] [US1] Create `src/components/admin/OverviewView.tsx`; make T045 pass
- [ ] T051 [US1] Create the sign-in page `src/app/(admin)/admin/sign-in/page.tsx` (public; redirects to `/admin` if a staff session already exists; otherwise renders `SignInForm` in the centered card from `design/Main.dc.html`)
- [ ] T052 [US1] Create the failure page `src/app/(admin)/auth/error/page.tsx` (research R11): heading, "That sign-in link did not work or has already been used.", and a link to `/admin/sign-in`; add the synchronous component `AuthError` in `src/components/admin/AuthError.tsx` with its test `src/components/admin/__tests__/auth-error.test.tsx` written first
- [ ] T053 [US1] Create the console layout `src/app/(admin)/admin/(console)/layout.tsx`: loads the person with `getShellStaff()`, renders `AdminShell` for staff, and renders `AccessDenied` (no data) for a guest or a signed-in non-staff user; a signed-out visitor is redirected to `/admin/sign-in`
- [ ] T054 [US1] Create the overview page `src/app/(admin)/admin/(console)/page.tsx`: `requireStaffPage()`, `loadOverview()`, render `OverviewView`
- [ ] T055 [US1] Walk quickstart steps 1 and 2 against local Supabase (`npm run db:reset`, `npm run dev`) and fix anything that does not match; record any gap in `specs/002-admin-console-v0/data-model.md`, "Gaps found"

**Checkpoint**: A staff member can sign in, see the overview, and sign out; a guest and a signed-out visitor see no data.

---

## Phase 4: User Story 2 - Manage households and guests (Priority: P1)

**Goal**: Staff browse and search households, open one, and create, edit and delete households and guests, with plus-one allowance, deadline override, staff-only notes, the delivery-problem flag, and duplicate review.

**Independent Test**: Quickstart step 3: create a household with two guests and an allowance, edit its contact email, find it by search, delete it, and see each change (and each refusal) in the list.

### Tests for User Story 2 (write first, they must fail)

- [ ] T056 [P] [US2] Write tests `src/lib/admin/data/__tests__/households.test.ts` with the fake database: `loadHouseholdList({ q, invited, show, page })` joins `staff_households()` with `staff_guests()`; `q` matches a household name or any guest name ignoring capitals and accents (for example "jose" finds "José"); `invited` keeps households with a guest invited to that event slug; `show` accepts `everyone`, `required`, `optional`, `meals` (using `household_rsvp_progress`), `delivery_problem`, `paper_only`; results are sorted by display name and paged 25 per page with a total count; each row has `plusOnesAllowed` and `plusOnesNamed` (guests with `is_plus_one` and not `is_placeholder`), unnamed seats (guests with `is_placeholder`), and flags `deliveryProblem`, `paperOnly` (empty `contact_email`) and `possibleDuplicate`; `loadDuplicates()` returns pairs from `find_duplicate_households()` with a plain-English reason ("Same name once spacing and capitals are ignored" or "Same address"); `loadHouseholdDetail(id)` returns all household fields including `address`, `notes`, `rsvp_deadline_override`, `delivery_problem`, its guests with their `guest_dietary` entries, and null for an unknown id; reads name their columns and never use `select *` on `households`, `guests` or `invitations`
- [ ] T057 [P] [US2] Write tests `src/lib/admin/actions/__tests__/households.test.ts` (node environment) for `updateHouseholdFields`: validates `display_name` is required ("Required"), `plus_one_allowance` is an integer from 0 ("`plus_one_allowance smallint default 0`, check ≥ 0"), `rsvp_deadline_override` is empty or a real Pacific date-time converted with `pacificLocalToIso`, `address` fields are trimmed text; updates `households` **without** reading the row back; leaves `contact_email` and `auth_user_id` out of the update; a database refusal for an allowance below the named plus-ones is shown as the `allowance_below_named_plus_ones` message and the typed values are kept; no session returns the session-ended message
- [ ] T058 [P] [US2] Write tests `src/lib/admin/actions/__tests__/guests.test.ts` (node environment) for `saveGuest`, `removeGuest` and `setGuestDietary`: a named guest requires `first_name` and `last_name` ("when `is_placeholder` is false, `first_name` and `last_name` are not null"); an unnamed plus-one seat is allowed only when `is_placeholder` is true and is created with `is_plus_one` true; naming a placeholder sets both names and keeps `is_plus_one` true; a duplicate name in the same household (unique per household on lower-cased `first_name`, `last_name`) shows the `duplicate_guest_name` message; adding a plus-one beyond the allowance shows the plain refusal; `removeGuest` deletes the guest only after the `confirm` step value is present; `setGuestDietary` adds or removes a (`guest_id`, `category_key`) row with severity `allergy` or `preference` and optional details
- [ ] T059 [P] [US2] Write tests `src/components/admin/__tests__/households-view.test.tsx` for `HouseholdsListView`: a search field labelled "Search", filter selects labelled "Invited to" and "Show", an Apply button; a `DataTable` with columns Household, Guests, Contact email, Outstanding, Status; badges "Delivery problem", "Paper only" and "Possible duplicate" with their text; a household with no email shows "None"; "3 of 118 households match" and page links; the tab links "All households" and "Possible duplicates (2)" (current one has `aria-current`); the duplicates tab lists pairs with links to both households and the sentence that nothing is merged automatically
- [ ] T060 [P] [US2] Write tests `src/components/admin/__tests__/household-detail.test.tsx` for the Details tab form (labels: Display name, Contact email, Plus-one allowance, RSVP deadline override (Pacific time), Mailing address, Message from the household (read only), Staff notes, a checkbox "Household turned off reminders", and the delivery-problem line), the Guests tab (name, email, dietary needs with Allergy or Preference badges, "Unnamed plus-one", Add guest, Edit, Remove), and the Remove tab (the `ConfirmPanel` with "type the household name" confirmation)
- [ ] T061 [P] [US2] Write tests `src/components/admin/__tests__/household-forms.test.tsx` for the three client forms with `createHousehold`, `updateHousehold` and `deleteHousehold` mocked: `HouseholdCreateForm` sends the guests added, shows `email_in_use` as "That contact email already belongs to another household." and keeps every typed value; `ContactEmailForm` sends the new email (empty means paper-only), shows `email_in_use` and `staff_account` messages from `messages.ts`; `DeleteHouseholdForm` enables the delete button only when the typed name matches exactly, calls `deleteHousehold`, and on success navigates to `/admin/households`

### Implementation for User Story 2

- [ ] T062 [US2] Create `src/lib/admin/data/households.ts` (imports `server-only`) with `loadHouseholdList`, `loadDuplicates`, `loadHouseholdDetail`, and a small `normalizeForSearch` helper; make T056 pass
- [ ] T063 [P] [US2] Create `src/lib/admin/actions/households.ts` (`"use server"`) with `updateHouseholdFields`; make T057 pass
- [ ] T064 [P] [US2] Create `src/lib/admin/actions/guests.ts` (`"use server"`) with `saveGuest`, `removeGuest`, `setGuestDietary`; make T058 pass
- [ ] T065 [P] [US2] Create `src/components/admin/HouseholdsListView.tsx` and `src/components/admin/DuplicatesView.tsx`; make T059 pass
- [ ] T066 [P] [US2] Create `src/components/admin/HouseholdDetailView.tsx` (Details, Guests and Remove tab bodies; the Answers tab is added in US4); make T060 pass
- [ ] T067 [P] [US2] Create `src/components/admin/forms/HouseholdCreateForm.tsx`, `ContactEmailForm.tsx` and `DeleteHouseholdForm.tsx` (`"use client"`, using the wrappers); make T061 pass
- [ ] T068 [US2] Create the households list page `src/app/(admin)/admin/(console)/households/page.tsx`: reads `q`, `invited`, `show`, `page` and `view=duplicates` from `searchParams` (a promise in this Next.js version), loads data, renders the list or the duplicates view
- [ ] T069 [US2] Create `src/app/(admin)/admin/(console)/households/new/page.tsx` rendering `HouseholdCreateForm` (loads event slugs for the "invite to" checkboxes)
- [ ] T070 [US2] Create `src/app/(admin)/admin/(console)/households/[id]/page.tsx` for the `details`, `guests` and `remove` tabs (unknown id shows a not-found message; `confirm` query value selects the confirmation step)
- [ ] T071 [US2] Walk quickstart step 3 and fix anything that does not match; record gaps in `data-model.md`

**Checkpoint**: Households and guests can be listed, searched, created, edited and deleted, with every refusal shown in plain words.

---

## Phase 5: User Story 3 - Import the guest list from a CSV or Excel file (Priority: P1)

**Goal**: Staff upload a CSV or Excel file and see how many households, guests and invitations were created, and for each bad row its row number, field and message, without losing the good rows. Both formats give identical results.

**Independent Test**: Quickstart step 4: import a CSV and the same data as `.xlsx`, then break three rows and see identical errors for both.

### Tests for User Story 3 (write first, they must fail)

- [ ] T072 [P] [US3] Create the test workbook builder `src/lib/guests/__tests__/fixtures/make-xlsx.ts`: `makeXlsx({ sheets: [{ name, rows }], blankRowsBeforeHeader? })` returns a `Uint8Array` of a minimal valid `.xlsx` (zip written with `fflate`: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, one `xl/worksheets/sheetN.xml` per sheet, and `xl/sharedStrings.xml` for text cells) using fake data only; add `make-xlsx.test.ts` proving `read-excel-file` can read it back (this also settles research R6 open point 2: how to list every sheet name from the default export)
- [ ] T073 [P] [US3] Write tests `src/lib/guests/__tests__/spreadsheet.test.ts` (node environment) for `xlsxToCsv(bytes)`: returns `{ csv, sheet: { name, index: 1, count } }` for the first sheet of a two-sheet workbook; cell conversion follows `contracts/import-excel.md` (text trimmed; number written without formatting; boolean as `true` or `false`; date as `YYYY-MM-DD`; empty as empty); commas, quotes and line breaks inside cells are escaped so `parseGuestImport` reads the same values; **row numbers match the sheet's own rows when the sheet has blank rows before the header** (research R6 open point 1: if `read-excel-file` drops leading blank rows, pad them back so error row numbers equal Excel's); throws a typed `SpreadsheetError` with `reason` `unreadable` for corrupt bytes or an old `.xls`, `empty` for no sheets or an empty first sheet, and `too_many_rows` above 5,000 rows
- [ ] T074 [P] [US3] Write tests in `src/app/api/admin/guests/import/__tests__/route.test.ts` (extend the existing file) for `.xlsx` support per `contracts/import-excel.md`: an `.xlsx` body with the spreadsheet content type and the equivalent CSV return identical `created` and `errors`; the response always includes `source` (`{ format: "csv" }` for CSV; `{ format: "xlsx", sheet: { name, index: 1, count: 2 } }` for a two-sheet workbook); an unknown or missing content type is still treated as CSV; corrupt bytes, an old `.xls`, an empty first sheet and more than 5,000 rows each return 422 `invalid_file` with the message from the contract; error messages never contain cell values; the existing 2 MiB limit still applies to bytes
- [ ] T075 [P] [US3] Add tests to `src/lib/admin-api/__tests__/client.test.ts` and `schemas.test.ts` for `importGuestsFile(file)`: sends the file bytes with `Content-Type` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` for `.xlsx` and `text/csv` for `.csv`; resolves the new `source` object; `importResponseSchema` requires `source`; a response without it resolves `bad_response`
- [ ] T076 [P] [US3] Write tests `src/components/admin/__tests__/import-view.test.tsx` for `ImportForm` (client, wrapper mocked) and `ImportResultView`: a file input labelled "File (.csv or .xlsx)" with `accept=".csv,.xlsx"`; the Import button is disabled until a file is chosen; the result shows "Read sheet "Guest list" from guests-sample.xlsx (the first of 2 sheets)" for Excel and no sheet sentence for CSV; four stat tiles (households, guests, invitations created, rows to fix); the error table (Row, Field, Problem); a whole-file error shows the plain message and "Nothing was imported."; a clean import shows "All rows imported."

### Implementation for User Story 3

- [ ] T077 [US3] Create `src/lib/guests/spreadsheet.ts` (imports `read-excel-file/node`) with `xlsxToCsv` and `SpreadsheetError`; make T072 and T073 pass
- [ ] T078 [US3] Change `src/app/api/admin/guests/import/route.ts`: read the body as bytes, choose the format from `Content-Type` (default CSV), call `xlsxToCsv` for Excel, run the unchanged `runGuestImport`, map `SpreadsheetError` to 422 `invalid_file` with the contract messages, cap rows at 5,000, and add `source` to the response; make T074 pass without changing the CSV behavior
- [ ] T079 [P] [US3] Add `importGuestsFile` to `src/lib/admin-api/client.ts` and the `source` object to `importResponseSchema` in `src/lib/admin-api/schemas.ts`; make T075 pass
- [ ] T080 [P] [US3] Update `docs/admin-api.md`, `specs/001-guest-data-model/contracts/admin-api.md` and `specs/001-guest-data-model/contracts/http-endpoints.md` for the import change (accepts `.xlsx`, `source` field, the new errors); confirm `src/lib/admin-api/__tests__/contract.test.ts` still passes
- [ ] T081 [P] [US3] Create `src/components/admin/forms/ImportForm.tsx` (`"use client"`) and `src/components/admin/ImportResultView.tsx`; make T076 pass
- [ ] T082 [US3] Create the import page `src/app/(admin)/admin/(console)/import/page.tsx` rendering the form and, after upload, the result (the client form holds the result in component state, since the upload goes through the route handler)
- [ ] T083 [US3] Walk quickstart step 4 with `scripts/sample-guests.csv` and a workbook saved from it (two sheets, one with blank rows before the header) and confirm identical counts and identical error row numbers in both; record anything unexpected in `data-model.md`

**Checkpoint**: A guest list can be imported from CSV or Excel with identical results.

---

## Phase 6: User Story 4 - Events, invitations and answering on behalf (Priority: P2)

**Goal**: Staff create and edit events, invite guests to an event, and record an RSVP and meal choices on a household's behalf. Every answer shows whether the guest or a named staff member gave it.

**Independent Test**: Quickstart step 5: create an optional event, invite two guests, record one attending (with a meal) and one declined as staff, confirm the overview counts change, and confirm each answer says "Recorded by staff" with the right name and time.

### Tests for User Story 4 (write first, they must fail)

- [ ] T084 [P] [US4] Write tests `src/lib/admin/data/__tests__/events.test.ts`: `loadEvents()` returns events in `display_order` with `invited` from `event_counts`, Pacific start time text, and "Default" when `rsvp_deadline` is null; `loadEvent(id)` returns one event or null; `loadInvitableGuests(q)` returns guests with their household names for the invite picker, searchable by name, plus each guest's current invitation for the chosen event so the result can say "already invited"
- [ ] T085 [P] [US4] Write tests `src/lib/admin/data/__tests__/answers.test.ts`: `loadHouseholdAnswers(householdId)` returns one `AnswerRow` per guest per invited event with status from `staff_invitations()`, `answeredBy` from `answeredByForRsvp` using `rsvp_history` and `staff`, the answered-at time in Pacific, the guest's meal choices for that event's courses from `meal_selections` each with its own `answeredBy` from `answeredByForMeal` (using the newest matching `meal_selection_history` row and its `actor_kind`), and the menu choices available per course (published or closed menus only, archived dishes excluded) so staff can pick one; staff names are read from `staff` and never from the guest tables
- [ ] T086 [P] [US4] Write tests `src/lib/admin/actions/__tests__/events.test.ts` (node environment) for `saveEvent` and `deleteEvent`: `slug` is required on create, matches lowercase letters, digits and hyphens only, is "stable key used by site code" and is **not changed** on edit (the form posts it read-only and the action ignores a changed value); `name` is required; `starts_at` is a real Pacific date-time converted with `pacificLocalToIso` or empty; `venue_name` text; `is_required` is a boolean ("`is_required boolean not null`"); `group_key` text or empty; `rsvp_deadline` Pacific date-time or empty; `display_order` is an integer that fits `smallint`; a duplicate `slug` shows a plain message; `deleteEvent` requires the confirm step and shows how many invitations will be removed
- [ ] T087 [P] [US4] Write tests `src/lib/admin/actions/__tests__/answers.test.ts` (node environment) for `inviteGuests`, `removeInvitation`, `recordRsvp` and `recordMeal`: `inviteGuests` calls RPC `invite(guest_ids, event_id)`, sends no email, and returns the `{ added, existing, unknown }` counts as the message "2 added, 1 already invited, 0 not found"; `removeInvitation` deletes only the (`guest_id`, `event_id`) row after the confirm step; `recordRsvp` calls RPC `staff_set_rsvp(guest_id, event_id, status)` for `pending`, `attending` or `declined` and rejects any other value; `recordMeal` calls `staff_set_meal(course_id, dish_id, guest_id)`, allows a null dish to clear a choice, and maps `invalid_meal` (declined guest, archived dish, or a dish not in the course) to its plain message; the deadline and the RSVPs-open setting never block these actions
- [ ] T088 [P] [US4] Write tests `src/components/admin/__tests__/events-view.test.tsx`: `EventsListView` (table Order, Event with its key and group, Starts in Pacific, Venue, Type badge, Deadline, Invited, Edit and Menu links); `EventForm` (labels Name, Short key (read-only when editing, with the hint "Cannot change later"), Starts (Pacific time) as a `datetime-local` input, Venue, Group, Display order, Own RSVP deadline (Pacific time), a checkbox "Required event"); `InviteView` (event select, guest search, a fieldset of guest checkboxes showing the household name, "3 selected", the submit button "Invite 3 guests", and the result sentence)
- [ ] T089 [P] [US4] Write tests `src/components/admin/__tests__/answers-view.test.tsx` for `AnswersView` (the household's Answers tab): the explanatory note about "Recorded by staff"; a table with Guest and event, Answer badge, `AnsweredByBadge`, Meals (each course with its choice and its own source), and a per-row control "Record on their behalf" (a labelled select and a Save button, labelled with the guest and event so each is unique); a declined row shows no meal controls; the note "Declining clears that guest's meal choices for the event. History keeps them."; an "Invite to another event" select and button; staff-recorded rows are distinguishable in text from guest rows

### Implementation for User Story 4

- [ ] T090 [P] [US4] Create `src/lib/admin/data/events.ts` (imports `server-only`); make T084 pass
- [ ] T091 [P] [US4] Create `src/lib/admin/data/answers.ts` (imports `server-only`, uses `attribution.ts` and `time.ts`); make T085 pass
- [ ] T092 [P] [US4] Create `src/lib/admin/actions/events.ts` (`"use server"`); make T086 pass
- [ ] T093 [P] [US4] Create `src/lib/admin/actions/answers.ts` (`"use server"`); make T087 pass
- [ ] T094 [P] [US4] Create `src/components/admin/EventsListView.tsx`, `EventForm.tsx` and `InviteView.tsx`; make T088 pass
- [ ] T095 [P] [US4] Create `src/components/admin/AnswersView.tsx`; make T089 pass
- [ ] T096 [US4] Create the events page `src/app/(admin)/admin/(console)/events/page.tsx` for the `list`, `edit` (with `id`) and `invite` tabs and the `confirm=delete` step
- [ ] T097 [US4] Add the **Answers** tab to `src/app/(admin)/admin/(console)/households/[id]/page.tsx` and its tab link in `HouseholdDetailView`; load `loadHouseholdAnswers` and render `AnswersView`
- [ ] T098 [US4] Walk quickstart step 5 (including signing in as a guest household and changing the answer, then reading the source on the Answers tab) and fix anything that does not match; record gaps in `data-model.md`

**Checkpoint**: Events, invitations and answering on behalf work, and every answer shows its true source.

---

## Phase 7: User Story 5 - Menus, dishes and dietary categories (Priority: P2)

**Goal**: Staff manage each event's menu, courses, dishes and dietary tags, manage dietary categories, and archive a dish while seeing which guests must choose again.

**Independent Test**: Quickstart step 6: build a menu with two courses and three dishes, tag one dish, publish it, then archive a chosen dish and confirm the affected guests are listed.

### Tests for User Story 5 (write first, they must fail)

- [ ] T099 [P] [US5] Write tests `src/lib/admin/data/__tests__/menus.test.ts`: `loadMenu(eventSlug)` returns the menu `status` (`draft`, `published`, `closed`), courses in `display_order` each with `requires_choice`, dishes with description, `archived_at`, tags each marked "suitable for" (category `kind` `diet`) or "contains" (category `kind` `allergen`), and `chosen_count` from `dish_totals`; an event with no menu returns `null` plus a flag so the screen can offer to create one; `loadDietaryCategories()` returns key, label, kind and order
- [ ] T100 [P] [US5] Write tests `src/lib/admin/actions/__tests__/menus.test.ts` (node environment) for `setMenuStatus`, `saveCourse`, `saveDish`, `archiveDish`, `restoreDish` and `saveCategory`: `setMenuStatus` accepts only `draft`, `published`, `closed` and creates the menu row (one per event, "`event_id unique`") if none exists; `saveCourse` requires `name`, an integer `display_order`, and a boolean `requires_choice` defaulting true; `saveDish` requires `name`, keeps `description` optional, replaces the dish's `dish_tags` set with the checked categories, and refuses a dish whose course belongs to another event; `archiveDish` calls RPC `archive_dish(dish_id)`, redirects with the counts of guests and households it returns, and archiving twice reports "nobody to ask again"; `restoreDish` clears `archived_at`; `saveCategory` requires `label`, `kind` of `diet` or `allergen`, derives a lowercase hyphenated `key` ("`dietary_categories.key text PK`") and refuses a duplicate key
- [ ] T101 [P] [US5] Write tests `src/components/admin/__tests__/menus-view.test.tsx`: `MenuViewBody` (event select, menu status select with "Draft (staff only)", "Published (guests can choose)", "Closed (guests can view only)", each course card with "Guests must choose one" or "Choice is optional", dish rows with description, tag badges reading "Vegetarian" or "Contains tree nuts", the chosen count, Edit and Archive; an archived dish struck through with an "Archived" badge and a Restore button); the archive `ConfirmPanel` text "clears 24 guests' choices (kept in history)" using the real count; the result sentence "24 guests in 15 households need to choose again." with a link to the households; `AddMenuItemForms` (course form and dish form with tag checkboxes labelled "(suitable for)" or "(contains)"); `CategoriesView` (table plus the add form)

### Implementation for User Story 5

- [ ] T102 [P] [US5] Create `src/lib/admin/data/menus.ts` (imports `server-only`); make T099 pass
- [ ] T103 [P] [US5] Create `src/lib/admin/actions/menus.ts` (`"use server"`); make T100 pass
- [ ] T104 [P] [US5] Create `src/components/admin/MenuViewBody.tsx`, `AddMenuItemForms.tsx` and `CategoriesView.tsx`; make T101 pass
- [ ] T105 [US5] Create the menus page `src/app/(admin)/admin/(console)/menus/page.tsx` for the `menu`, `add` and `categories` tabs, the `event` query value, and the `confirm=archive&dish=` step
- [ ] T106 [US5] Walk quickstart step 6 and fix anything that does not match; record gaps in `data-model.md`

**Checkpoint**: Menus, dishes, dietary tags and categories can be managed, and archiving a dish reports who must choose again.

---

## Phase 8: User Story 6 - Campaigns and delivery status (Priority: P2)

**Goal**: Staff create a campaign with a message type and an audience, preview exactly who it reaches and who is skipped, save, schedule, send now or cancel it, and see delivery status per household afterwards.

**Independent Test**: Quickstart step 7: create a draft for households with unanswered required events, preview the audience, send it, see per-household status, and confirm a sent campaign can no longer be edited.

### Tests for User Story 6 (write first, they must fail)

- [ ] T107 [P] [US6] Add tests to `src/lib/admin-api/__tests__/client.test.ts` for a new `sendCampaign(id)`: posts to `/api/admin/campaigns/{id}/send`; success resolves the parsed `sendCampaignResponseSchema` body; 404, 409 `campaign_not_sendable`, 409 `template_missing` and 422 `invalid_audience` resolve `{ ok: false, ... }` with the code; it never throws
- [ ] T108 [P] [US6] Write tests `src/lib/admin/__tests__/audience-form.test.ts` for the audience helpers: `audienceFromForm(formData)` builds a value accepted by `audienceSchema` from `src/lib/campaigns/audience.ts` for scope `all`, for scope `household` (with `household_id`), and for scope `filter` with each filter (`invited_to_event`, `required_events_unanswered`, `optional_event_unanswered`, `meals_not_chosen`, `not_yet_sent_message_type`, `delivery_problem`); scope `filter` with no filter chosen is rejected with "Choose at least one filter, or send to everyone or one household."; `describeAudience(audience, events)` returns the words shown in the campaigns table ("All households", "Required answers outstanding", "Invited to Rehearsal"); `audienceToForm` round-trips
- [ ] T109 [P] [US6] Write tests `src/lib/admin/data/__tests__/campaigns.test.ts`: `loadCampaigns()` returns name, message type label, audience summary, status, scheduled time in Pacific, and `lastError` in plain words (for example `template_missing` becomes "No email template is registered for this message type yet."); `loadCampaign(id)` returns the editable fields; `loadDelivery(id)` returns one row per message with the household name, status, a plain-English detail ("No email on file" for `skip_reason` `no_email`, "Opted out of reminders" for `opted_out`, "Household flagged with a delivery problem" for `bounced` or `complained`), last event time in Pacific, and the counts per status; `loadMessageTypes()` and event slugs for the editor; check the real `campaigns` columns in `supabase/migrations/20261019131118_messaging.sql` and `src/types/database.ts` before shaping the insert
- [ ] T110 [P] [US6] Write tests `src/lib/admin/actions/__tests__/campaigns.test.ts` (node environment) for `previewAudience`, `saveCampaign` and `cancelCampaign`: `previewAudience` calls RPC `resolve_audience(filter, message_type_key)` and returns the households that will be emailed and the skipped ones with reasons, saving nothing; an audience that fails `audienceSchema` returns the plain message and does not call the RPC; `saveCampaign` requires `name` and a known `message_type_key`, stores a valid `audience`, sets status `draft` or `scheduled` (scheduled needs a Pacific `scheduled_for` converted with `pacificLocalToIso`, and it must be in the future), and refuses to edit a campaign in any status other than `draft` or `scheduled` ("`sending` and later are immutable") showing the `campaign_locked` message; `cancelCampaign` moves `draft` or `scheduled` to `cancelled` after the confirm step and shows `invalid_status_transition` otherwise
- [ ] T111 [P] [US6] Write tests `src/components/admin/__tests__/campaigns-view.test.tsx`: `CampaignsListView` (name with message type, audience words, status badge, sends time in Pacific, Edit or View delivery or Cancel by status); `CampaignEditor` (client, with `previewAudience` and `saveCampaign` mocked): fields Campaign name, Message type (non-essential marked), Who receives it, a filters fieldset with six labelled checkboxes, Send at (Pacific time); the buttons Preview audience, Save draft, Schedule, Send now, Cancel campaign; a read-only note instead of the form for `sending`, `done` or `cancelled`; `AudiencePreviewView` ("21 households will be emailed", "3 are skipped: 2 with no email (need a paper invite), 1 opted out", rows with Will send or the skip reason badge, links to households); `SendCampaignForm` (client, `sendCampaign` mocked): "Send now" first shows the `ConfirmPanel` ("emails go out straight away and cannot be unsent"), confirming calls the wrapper, and `template_missing`, `campaign_not_sendable` and `invalid_audience` show their plain messages with nothing sent; `DeliveryView` (counts per status, rows with household link, status badge, detail, time)

### Implementation for User Story 6

- [ ] T112 [US6] Add `sendCampaign` to `src/lib/admin-api/client.ts`; make T107 pass
- [ ] T113 [P] [US6] Create `src/lib/admin/audience-form.ts` (reuses `audienceSchema`); make T108 pass
- [ ] T114 [P] [US6] Create `src/lib/admin/data/campaigns.ts` (imports `server-only`); make T109 pass
- [ ] T115 [P] [US6] Create `src/lib/admin/actions/campaigns.ts` (`"use server"`); make T110 pass
- [ ] T116 [P] [US6] Create `src/components/admin/CampaignsListView.tsx`, `AudiencePreviewView.tsx`, `DeliveryView.tsx`, `forms/CampaignEditor.tsx` and `forms/SendCampaignForm.tsx`; make T111 pass
- [ ] T117 [US6] Create the campaigns page `src/app/(admin)/admin/(console)/campaigns/page.tsx` for the `list`, `edit` (with `id`) and `delivery` tabs and the `confirm=send` and `confirm=cancel` steps
- [ ] T118 [US6] Walk quickstart step 7 (with no template registered, expecting the "no template" message and nothing sent) and fix anything that does not match; record gaps in `data-model.md`

**Checkpoint**: Campaigns can be built, previewed, sent or cancelled, and delivery is visible per household.

---

## Phase 9: User Story 7 - Reports, exports and history (Priority: P3)

**Goal**: Staff view dish totals, the dietary list and meal conflicts, download the three CSV exports, and read the change log, RSVP history and meal choice history.

**Independent Test**: Quickstart step 8: open each report and compare it with the data, download each export, and make a change then find it in the change log attributed to the right person.

### Tests for User Story 7 (write first, they must fail)

- [ ] T119 [P] [US7] Write tests `src/lib/admin/data/__tests__/reports.test.ts`: `loadDishTotals(eventSlug)` returns rows from `dish_totals` grouped by course in `course_display_order`, with "Not yet chosen" rows (`not_yet_chosen` true) shown last in each course; `loadDietaryList(eventSlug)` returns guest, household, restriction label, severity and notes from `dietary_list`; `loadMealConflicts(eventSlug)` returns rows from `meal_conflicts` with who made each choice from the newest matching `meal_selection_history` row via `answeredByForMeal`; each loader takes an event slug and returns an empty list for an unknown one
- [ ] T120 [P] [US7] Write tests `src/lib/admin/data/__tests__/history.test.ts`: `loadChangeLog({ from, to, by, page })` returns `audit_log` rows newest first, 50 per page, with the person's name from `staff` (or the role alone for a removed staff member), an entity label ("Household", "Campaign"), action, and `changed_fields` as words and **never any values**; `from` and `to` are Pacific calendar days converted to the start and end of that day in UTC; `by` accepts `anyone`, a staff user id, `guest` or `system`; `loadRsvpHistory(...)` returns guest name (or "Removed guest" when `guest_id` is null), event name, "Pending to Attending", and the stored `actor_kind` shown through `AnsweredBy`; `loadMealHistory(...)` returns guest, course, from and to dish names (or "None"), the reason (`changed`, `declined`, `dish_archived`) in words, and attribution straight from each row's stored `actor_kind` (rows with an empty one use the account comparison)
- [ ] T121 [P] [US7] Write tests `src/components/admin/__tests__/reports-view.test.tsx`: `ReportsView` tabs "Dish totals", "Dietary list", "Meal conflicts (n)" and "Exports"; dish totals table; dietary list with Allergy badges first; conflicts table with an `AnsweredByBadge` per row and the resolve note; the Exports tab lists the three files as plain download links to `/api/admin/exports/guests`, `/responses` and `/caterer` with the personal-data warning; `HistoryView` tabs "Change log", "RSVP history" and "Meal choices", a filter form (From, To, Changed by, Apply), the sentence "Shows which fields changed, never their values", and "Removed guest" for deleted guests

### Implementation for User Story 7

- [ ] T122 [P] [US7] Create `src/lib/admin/data/reports.ts` (imports `server-only`); make T119 pass
- [ ] T123 [P] [US7] Create `src/lib/admin/data/history.ts` (imports `server-only`); make T120 pass
- [ ] T124 [P] [US7] Create `src/components/admin/ReportsView.tsx` and `HistoryView.tsx`; make T121 pass
- [ ] T125 [US7] Create the reports page `src/app/(admin)/admin/(console)/reports/page.tsx` (tabs `dish`, `diet`, `conflicts`, `exports`; `event` query value)
- [ ] T126 [US7] Create the history page `src/app/(admin)/admin/(console)/history/page.tsx` (tabs `log`, `rsvp`, `meals`; `from`, `to`, `by` and `page`)
- [ ] T127 [US7] Walk quickstart step 8 and fix anything that does not match; record gaps in `data-model.md`

**Checkpoint**: Reports, downloads and history all work, and history shows who did what.

---

## Phase 10: User Story 8 - Settings and staff access (Priority: P3)

**Goal**: Staff change the default RSVP deadline and the RSVPs-open switch. The couple, not the planner, can list staff, grant planner access and revoke access.

**Independent Test**: Quickstart step 9: toggle RSVPs closed and see it persist; as a planner see no staff controls; as a couple member grant and revoke planner access and see the last couple member cannot be removed.

### Tests for User Story 8 (write first, they must fail)

- [ ] T128 [P] [US8] Add tests to `src/lib/admin-api/__tests__/client.test.ts` and `src/lib/admin-api/__tests__/schemas.test.ts` for new `grantStaff(body)` and `revokeStaff(userId)` wrappers: `grantStaff` posts the body shaped by `grantStaffRequestSchema` to `/api/admin/staff` and resolves `grantStaffResponseSchema`; `revokeStaff` sends `DELETE /api/admin/staff/{userId}` and resolves null on 204; 403, 409 `last_couple` and 409 (already staff) resolve their codes; they never throw
- [ ] T129 [P] [US8] Write tests `src/lib/admin/data/__tests__/settings.test.ts`: `loadSettings()` returns `default_rsvp_deadline` as a Pacific `datetime-local` value, `rsvp_open`, and the single settings row; `loadStaff()` returns each member's display name and role from `staff` (names only, gap G5)
- [ ] T130 [P] [US8] Write tests `src/lib/admin/actions/__tests__/settings.test.ts` (node environment) for `saveSettings`: `default_rsvp_deadline` is empty or a real Pacific date-time converted with `pacificLocalToIso`; `rsvp_open` is a boolean; updates the single `settings` row ("`id boolean primary key default true check (id)`"); a success message "Saved. Default deadline is May 1, 11:59 PM PT."; invalid input keeps what was typed
- [ ] T131 [P] [US8] Write tests `src/components/admin/__tests__/settings-view.test.tsx`: `SettingsView` for a couple member (RSVP settings form with labelled fields; staff table with Remove access buttons on other people but none on yourself; the add-planner form with Planner name and Planner email) and for a planner (the same table with a "View only" badge, no remove buttons, no add form, and the sentence "Only the couple can add or remove staff."); `StaffForms` (client, wrappers mocked): granting shows the new person in the list message, `last_couple` shows "The last couple member cannot be removed.", a 403 shows the planner message, revoking asks for confirmation first

### Implementation for User Story 8

- [ ] T132 [US8] Add `grantStaff` and `revokeStaff` to `src/lib/admin-api/client.ts`; make T128 pass
- [ ] T133 [P] [US8] Create `src/lib/admin/data/settings.ts` (imports `server-only`); make T129 pass
- [ ] T134 [P] [US8] Create `src/lib/admin/actions/settings.ts` (`"use server"`); make T130 pass
- [ ] T135 [P] [US8] Create `src/components/admin/SettingsView.tsx` and `forms/StaffForms.tsx`; make T131 pass
- [ ] T136 [US8] Create the settings page `src/app/(admin)/admin/(console)/settings/page.tsx` (shows staff controls only when the session role is `couple`; the handlers still enforce this)
- [ ] T137 [US8] Walk quickstart step 9 as both roles and fix anything that does not match; record gaps in `data-model.md`

**Checkpoint**: Settings and staff access work, with planner restrictions enforced.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature checks, documentation, and the rehearsal that finds gaps.

- [ ] T138 [P] Walk quickstart steps 10 and 11 (Pacific time across a daylight-saving boundary and from a different system time zone; phone width at about 390 px; keyboard only for a household edit) and fix anything that does not match
- [ ] T139 [P] Accessibility pass over every page against the wireframes in `design/`: each form control has a visible label, each icon-free button has text, focus outlines are visible, tab order follows reading order, badges never rely on colour alone, text contrast is at least 4.5:1 in `admin.css`; fix findings in the components or the stylesheet
- [ ] T140 [P] Confirm no guest personal data is logged: search `src/lib/admin` and `src/app/(admin)` for `console.` and for any `log.*` call with an email, name or address; every log call passes codes and counts only (Constitution III)
- [ ] T141 [P] Confirm every page is wrapped by an auth check close to its data (`requireStaffPage`, `requireCouplePage` or the layout's guest handling), and every action goes through `runAdminAction` (research R2); add a test `src/lib/admin/__tests__/guards-coverage.test.ts` that lists the files in `src/lib/admin/actions` and fails if one exports an action that does not call `runAdminAction`
- [ ] T142 Run `npm run build` with the placeholder variables from `.github/workflows/ci.yml` and fix any build error (the CI build step now runs because the app has pages)
- [ ] T143 Update `README.md` (Commands and Layout) and the Commands block of `CLAUDE.md` if anything changed; confirm `CLAUDE.md`, `docs/architecture.md` and `docs/admin-api.md` no longer say "no screens" anywhere (search for "no screen", "no user interface" and "backend only"), and mark decisions 0009 and 0010 "accepted" once the couple confirms
- [ ] T144 Run the full quickstart walkthrough from `quickstart.md` start to finish as the SC-009 rehearsal, and list every gap and awkward spot in `data-model.md`, "Gaps found", with a proposed follow-up each
- [ ] T145 Before merging, tell the couple in plain words that this branch contains one database migration (the `actor_kind` column on the meal history table) and that merging to `main` applies it to the hosted database automatically; wait for their yes, do not push it by hand (`AGENTS.md`), and name the migration file and the test `360-meal-history-actor-kind` in the pull request description
- [ ] T146 Before pushing run `npm run format:check && npm run lint && npm run type-check && npm test` (and `npm run test:db`, which now includes the new meal-history test), then update the wireframes' `design/README.md` if any screen's behavior intentionally differs from them and say how

---

## Dependencies and Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies; T001 first (T072 needs the packages), then the rest in parallel.
- **Foundational (Phase 2)**: depends on Setup. Blocks every story. Within it: T009 to T011 (stylesheet and layout), T012 to T013 (time), T014 to T015 (messages), T016 to T017 (session), T018 (fixture), T019 to T022 (the meal-history database change: test, migration, run and regenerate types, doc line; it needs local Supabase running), T023 to T024 (attribution, which should follow T021 so it can use the regenerated types), T025 to T026 (action helper) and the components T027 to T040 are largely independent of each other; T026 needs T015, T017 and T013; T038 needs T026 and T028; T032 needs T028.
- **User stories (Phases 3 to 10)**: all depend on Phase 2 only.
  - **US1** has no story dependencies; it creates the shell and the sign-in everything else uses.
  - **US2** can start once US1's console layout (T053) exists to display it, but its logic and components do not depend on US1.
  - **US3** is independent of US2 except that the import page links to the households list.
  - **US4** needs US2 for the household page it adds a tab to (T097) and the guest list data; the events side is independent.
  - **US5** is independent; **US6** needs events from US4 only for the filter list (read-only), **US7** needs US4 (answers and attribution) and US5 (dish totals) to show meaningful data, but its code does not depend on theirs; **US8** is independent.
- **Polish (Phase 11)**: after the stories being shipped.

### Within each story

Tests first (they must fail), then data functions and actions, then components, then the page, then the quickstart walk. Pages come last because they only assemble tested pieces.

### Parallel opportunities

- Phase 1: T002 to T008 in parallel after T001.
- Phase 2: the pairs and the shared components marked [P] can be built in parallel by different people or sessions.
- Inside each story: every task marked [P] touches a different file and can run together, for example in US2 the three action files, the two view components and the forms (T063 to T067) after the data function (T062).
- Across stories: after Phase 2, US1, US3, US5 and US8 can be built in parallel; US2 and US4 share the household detail page, so build their page tasks (T070, T097) one after the other.

### Parallel example: User Story 2

```text
After T056 to T061 fail as expected:
  T062 data functions            (src/lib/admin/data/households.ts)
Then together:
  T063 updateHouseholdFields     (src/lib/admin/actions/households.ts)
  T064 guest actions             (src/lib/admin/actions/guests.ts)
  T065 list and duplicates views (src/components/admin/HouseholdsListView.tsx, DuplicatesView.tsx)
  T066 detail view               (src/components/admin/HouseholdDetailView.tsx)
  T067 client forms              (src/components/admin/forms/*.tsx)
Then in order: T068, T069, T070 (pages), T071 (walkthrough)
```

---

## Implementation Strategy

### MVP first

1. Phase 1 and Phase 2.
2. **User Story 1** alone: sign in, overview, sign out, and access control. Stop and check it against quickstart steps 1 and 2. This proves the route group, the stylesheet, the shell, the session guard and the testing approach before the larger stories rely on them.
3. Add **User Story 2** (households and guests) and **User Story 3** (import). These three are all P1 and together are the smallest console that is useful for loading and checking the real guest list.

### Incremental delivery

After the P1 stories, add US4, US5, US6 (P2) in any order, then US7 and US8 (P3). Each story ends with a quickstart walkthrough and can be shown to the couple before the next begins.

### Notes

- Commit after each task or small group of related tasks, and keep the test and the code that makes it pass in the same commit or adjacent ones.
- Never skip, disable or delete a test to get a check to pass.
- If a task reveals a missing data-layer capability, do not work around it: record it in `data-model.md`, "Gaps found", and carry on (requirement FR-030).
- Do not edit `.specify/`, `.claude/skills/speckit-*` or `src/types/database.ts`.
