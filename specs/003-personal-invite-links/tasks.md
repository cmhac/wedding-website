---
description: "Task list for personal invite links and shared household sign-in"
---

# Tasks: Personal invite links and shared household sign-in

**Input**: Design documents from `specs/003-personal-invite-links/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. The constitution's first principle is test-first: every test task below is written and seen failing before the implementation task that follows it. Database changes get pgTAP tests (`npm run test:db`); code gets Jest tests in `__tests__` next to the source.

**Organization**: By user story from the spec, so each story can be built and checked on its own after the foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the spec's user story (US1 to US7)
- Migrations are created with `npx supabase migration new <name>`; `<ts>` below stands for the timestamp that command adds. After every migration: `npm run db:reset` and `npm run db:types` (never hand-edit `src/types/database.ts`).
- "Research Rn" points to the decision of that number in [research.md](./research.md).

---

## Phase 1: Setup

**Purpose**: settings, secrets and the three "verify first" checks the design depends on.

- [x] T001 Add `INVITE_LINK_SECRET` (server-only, long random string) and `HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN` (default `households.invalid`) to `.env.example` with one-line comments, and read them through `src/lib/env.ts` (with a test in `src/lib/__tests__/env.test.ts` that `INVITE_LINK_SECRET` is required on the server and never exposed with a `NEXT_PUBLIC_` prefix)
- [x] T002 Verify-first test (research R2) in `src/lib/auth/__tests__/verify-first.test.ts`, run against the local Supabase and skipped automatically when it is not running: `auth.admin.createUser({ email: "household-<uuid>@households.invalid", email_confirm: true })` succeeds. Record the outcome in `specs/003-personal-invite-links/research.md` under R2; if refused, switch the default domain in `src/lib/env.ts` to the fallback named in R2
- [x] T003 Verify-first test (research R1) in the same file: for that user, `auth.admin.generateLink({ type: "magiclink", email })` returns `properties.hashed_token`, and `verifyOtp({ token_hash, type: "email" })` on a server client returns a session. Record which `type` works in research R1
- [x] T004 Verify-first pgTAP test (research R10) in `supabase/tests/database/170-household-sessions.test.sql` (first assertions only): deleting a user's `auth.sessions` rows also removes their `auth.refresh_tokens` rows. Record the outcome in research R10

**Checkpoint**: the three assumptions hold, or the fallbacks are recorded before anything is built on them.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: move addresses into `household_contacts`, give every household a synthetic Auth user, and add the shared helper that turns a household into a session. Every user story depends on this.

**⚠️ No user story work starts until this phase is complete.**

### Tests first

- [x] T005 [P] Write `supabase/tests/database/150-household-contacts.test.sql`: table `household_contacts` exists with RLS on; columns as data-model.md (`kind` enum `contact_kind` (`email`), `value` citext not null "trimmed and lower-cased on write", `delivery_problem` boolean default false); unique (`kind`, `value`) refuses the same address on two households, ignoring case; a malformed email is refused; an address equal to a staff account's email is refused with `staff_account`; a guest session reads only its own household's rows and cannot insert, update or delete any; anon reads nothing; staff can do all; changing `value` clears that row's `delivery_problem`; `households.delivery_problem` becomes true when any contact is flagged and false when none is; changes appear in `audit_log` with column names only
- [x] T006 [P] Write `supabase/tests/database/155-contacts-data-move.test.sql`: after the migrations, `households` has no `contact_email` column, and the seed households' addresses are present in `household_contacts`
- [x] T007 [P] Update the existing database tests that insert or read `households.contact_email` to use `household_contacts` instead, keeping every assertion's meaning: `supabase/tests/database/020-households-guests-events.test.sql`, `030-audit-and-history.test.sql`, `040-seed-sanity.test.sql`, `110-import-and-duplicates.test.sql`, `120-invite.test.sql`, `130-event-counts.test.sql`, `140-household-records.test.sql`, `210-rsvp-rpc.test.sql`, `220-staff-rsvp.test.sql`, `310-menus-rls.test.sql`, `320-meal-selections.test.sql`, `330-dietary-views.test.sql`, `340-archive-dish.test.sql`, `350-dietary-meal-rls.test.sql`, `360-meal-history-actor-kind.test.sql`, `410-household-progress.test.sql`, `510-messaging-rls.test.sql`, `520-resolve-audience.test.sql`, `530-message-events.test.sql`, `540-opt-out.test.sql`, `710-planner.test.sql`, `810-admin-direct-access.test.sql`, `820-staff-only-columns.test.sql`, `830-staff-account-link.test.sql`; add a shared fixture helper in `supabase/tests/support/` if one keeps them short
- [x] T008 [P] Write `src/lib/guests/__tests__/household-access.test.ts` cases for the new behaviour (research R2): creating a household always creates an Auth user with address `household-<household id>@<HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN>` and links it, with or without contacts; contacts are saved in `household_contacts`; an address in use returns `email_in_use`; a staff address returns `staff_account`; adding, changing and removing a contact never calls the Auth admin API; deleting a household deletes its Auth user unless it is a staff account; no failure result contains an address
- [x] T009 [P] Write `src/lib/auth/__tests__/household-session.test.ts` for `createHouseholdSession(householdId)`: looks up the household's Auth user with the service-role client, calls `generateLink` then `verifyOtp` with the type recorded in T003, returns `{ ok: true }` with cookies set on the response, and `{ ok: false }` (no detail) for a missing household, a household with no Auth user, or any Supabase error

### Implementation

- [x] T010 Migration `supabase/migrations/<ts>_household_contacts.sql`: enum `contact_kind`, table `household_contacts` per data-model.md, its RLS policies and grants, the staff-address trigger, the trigger maintaining `households.delivery_problem`, the trigger clearing a row's `delivery_problem` when `value` changes, audit trigger; copy every non-null `households.contact_email` into it; drop the old `households_clear_delivery_problem` trigger
- [x] T011 Migration `supabase/migrations/<ts>_household_contacts_functions.sql`: change `create_household_record`, `set_household_contact` (replace with `add_household_contact`, `update_household_contact`, `remove_household_contact`, staff-only, raising `email_in_use`, `staff_account`, `not_found`), `import_households`, `staff_households()` and every view or function that reads `contact_email` (from `20261019124133_import_invite_duplicates.sql`, `20261019131120_messaging_rpc.sql`, `20261019132951_report_columns_and_stale_claims.sql`, `20261019224307_hide_staff_only_columns.sql`) to use `household_contacts`; then drop `households.contact_email`; update `supabase/seed.sql` to insert fake contacts (T005 to T007 pass)
- [x] T012 Rewrite `src/lib/guests/household-access.ts` per T008: synthetic Auth user at creation (`createHouseholdWithAccess` takes `contacts: { kind: "email"; value: string }[]`), new `addHouseholdContact`, `updateHouseholdContact`, `removeHouseholdContact`, `deleteHouseholdWithAccess`; remove `updateHouseholdContactEmail` and `linkHouseholdAccounts` (the import now gets accounts through T013); `HouseholdSummary` gains `contact_count` and keeps `paper_only`
- [x] T013 Update `src/lib/guests/run-import.ts` and its test in `src/lib/guests/__tests__/` so every imported household gets its synthetic Auth user after `import_households` returns its ids (counts only in the result, no addresses)
- [x] T014 [P] Implement `src/lib/auth/household-session.ts` per T009
- [x] T015 [P] Write `scripts/convert-household-accounts.ts` (and a test in `scripts/__tests__/`): for each household whose Auth user's email is not the synthetic form, rename it to the synthetic address; idempotent; prints counts only to `process.stdout`
- [x] T016 Update every remaining source reference to `contact_email` so `npm run type-check` and `npm test` pass: `src/lib/admin-api/schemas.ts`, `src/lib/admin/data/households.ts`, `src/lib/admin/data/overview.ts`, `src/app/api/admin/households/route.ts`, `src/app/api/admin/households/[id]/route.ts` (PATCH no longer accepts addresses), `src/components/admin/forms/HouseholdCreateForm.tsx` (one or more address inputs), and their tests; `src/components/admin/forms/ContactEmailForm.tsx` is replaced in US4 and here only stops compiling against the removed field (show the first address read-only)
- [x] T017 Regenerate `src/types/database.ts` with `npm run db:types` and run `npm run format:check && npm run lint && npm run type-check && npm test && npm run test:db`

**Checkpoint**: every household has a synthetic Auth user and a list of addresses; the whole suite is green; nothing guest-visible has changed yet.

---

## Phase 3: User Story 1 - Guest signs in by opening their invitation (Priority: P1) 🎯 MVP

**Goal**: a household's personal link signs in any device, keeps working past the RSVP deadline, and stops on the wedding day.

**Independent test**: copy a household's link from the database helper, open it in two browsers, reach the RSVP in both; with the deadline in the past see `deadline_passed: true`; with the wedding event dated today get `/auth/error`.

### Tests for User Story 1

- [ ] T018 [P] [US1] Write `src/lib/auth/__tests__/invite-link.test.ts`: `inviteToken(householdId, version)` gives `<22-char base64url id>.<43-char base64url HMAC-SHA256 of "id:version" keyed with INVITE_LINK_SECRET>`; `parseInviteToken` rejects wrong length, bad characters, a tampered signature (constant-time compare) and a different version; the token never contains anything but the id and signature; `inviteLinkUrl(householdId, version)` builds `${NEXT_PUBLIC_SITE_URL}/i/<token>`
- [ ] T019 [P] [US1] Write `supabase/tests/database/160-invite-links.test.sql`: `households.invite_link_version integer not null default 1` and `invite_link_issued_at timestamptz not null default now()` exist and are hidden from guest reads; `settings.wedding_event_id` references `events` with `on delete set null`; `invite_links_open()` is true with no wedding event, true the day before the event's date in `America/Los_Angeles`, false on that date and after (test across midnight Pacific and UTC); only the service role can execute it
- [ ] T020 [P] [US1] Write `src/app/i/[token]/__tests__/route.test.ts`: valid token and links open → `302` to the RSVP path with session cookies, `Cache-Control: no-store` and `X-Robots-Tag: noindex`; a relative `next` under the RSVP path is honoured and anything else ignored; malformed token, wrong signature, superseded version, unknown household, links closed, and a failing `createHouseholdSession` each → `302` to `/auth/error` with no query detail; opening twice gives two independent sessions; nothing is logged but an outcome code
- [ ] T021 [P] [US1] Add to `src/app/api/guest/rsvp/__tests__/route.test.ts`: `deadline_passed` is false before the deadline, true when RSVPs are closed globally or every invited event's effective deadline has passed; `PUT` after the deadline still returns `409 rsvp_closed`

### Implementation for User Story 1

- [ ] T022 [US1] Migration `supabase/migrations/<ts>_invite_links.sql`: the two `households` columns (staff-only), `settings.wedding_event_id`, `invite_links_open()` per research R6 (T019 passes)
- [ ] T023 [P] [US1] Implement `src/lib/auth/invite-link.ts` per T018 using Node's `crypto` (`createHmac`, `timingSafeEqual`)
- [ ] T024 [US1] Implement `src/app/i/[token]/route.ts` per T020 and contracts/guest-api.md, using `parseInviteToken`, a service-role read of the household's `invite_link_version` and `auth_user_id`, `invite_links_open()`, and `createHouseholdSession`; reuse the relative-path rule from `src/app/auth/callback/route.ts` (extract it to a shared helper if needed)
- [ ] T025 [US1] Add `deadline_passed` to the response in `src/app/api/guest/rsvp/route.ts` and its schema in `src/lib/guest-api/schemas.ts` per T021
- [ ] T026 [US1] Confirm sessions do not expire: add to `docs/manual-setup.md` that the Supabase Auth session time-box and inactivity timeout stay unset, with the Management API check from quickstart.md

**Checkpoint**: personal links work end to end; MVP reachable once invitations can carry the link (US5) or staff copy it (US4).

---

## Phase 4: User Story 2 - Several people share one household's access (Priority: P1)

**Goal**: every address and device reaches the same household with the same rights, and guests can see (not edit) their household's addresses.

**Independent test**: a household with two addresses; sessions from both read and save the same RSVP; concurrent saves stay consistent; `GET /api/guest/rsvp` shows both addresses masked.

### Tests for User Story 2

- [ ] T027 [P] [US2] Add to `supabase/tests/database/210-rsvp-rpc.test.sql`: two sessions of the same household Auth user each save answers; the final state is consistent (last save wins per field) and `audit_log` has one entry per save
- [ ] T028 [P] [US2] Add to `src/app/api/guest/rsvp/__tests__/route.test.ts`: the response includes `contacts: [{ kind: "email", masked }]` with every address masked as first character, `•••`, then `@domain`; no unmasked address appears anywhere in the body
- [ ] T029 [P] [US2] Add to `src/lib/auth/__tests__/session.test.ts`: `getSession` treats any session of the household Auth user as kind `guest` (the "responder" wording is gone)

### Implementation for User Story 2

- [ ] T030 [US2] Add masked `contacts` to `src/app/api/guest/rsvp/route.ts` and `src/lib/guest-api/schemas.ts` (masking helper in `src/lib/guest-api/mask.ts` with its own test)
- [ ] T031 [US2] Update comments and wording that say "responder" in `src/lib/auth/session.ts` and `src/lib/guests/household-access.ts`, keeping behaviour (T029)

**Checkpoint**: shared access works with addresses added directly in the database or through the create form.

---

## Phase 5: User Story 3 - Guest asks for a sign-in link on a new device (Priority: P1)

**Goal**: typing any household address emails a short-lived link to that address, with neutral answers and durable limits.

**Independent test**: request links for each of a household's two addresses and for an unknown address; the known ones get one email each that signs in to the same household; all three answers are identical; a fourth request inside ten minutes sends nothing.

### Tests for User Story 3

- [ ] T032 [P] [US3] Write `supabase/tests/database/180-sign-in-attempts.test.sql`: table `sign_in_attempts` (`address_hash text not null`, `at timestamptz default now()`) has RLS on and no policies; `settings` gains `sign_in_limit_per_address smallint default 3`, `sign_in_window_minutes smallint default 10`, `sign_in_limit_global_per_hour integer default 60`; `allow_sign_in_attempt(address_hash)` allows three per address per window then refuses, refuses past the global limit, records every call, and is executable only by the service role; the cleanup deletes rows older than one day
- [ ] T033 [P] [US3] Write `src/lib/auth/__tests__/sign-in-limits.test.ts`: `addressHash(email)` is a keyed SHA-256 of the trimmed, lower-cased address (same for different casing, different for different addresses, never the address itself); `allowSignInAttempt` returns false on any database error (fail closed)
- [ ] T034 [P] [US3] Rewrite `src/app/api/guest/sign-in/__tests__/route.test.ts`: always `202` with the existing neutral message after at least 1.5 seconds; known address within limits → one email to exactly the typed address, rendered from `magic_link` with `audience: "guest"` and `sign_in_url` = `${NEXT_PUBLIC_SITE_URL}/auth/confirm?token_hash=…&type=email`; unknown address, limit reached, household without an Auth user, missing template, `generateLink` error, or Resend failure → same `202`, nothing sent, an outcome code logged with no address; `signInWithOtp` is never called; per-IP `429` unchanged; a staff address is treated as unknown
- [ ] T035 [P] [US3] Write `src/app/auth/confirm/__tests__/route.test.ts`: `GET` and form-encoded `POST` with a valid `token_hash` and `type=email` → session cookies and `302` to the RSVP path (staff accounts to `/admin`); relative `next` rule as `/auth/callback`; missing or bad token, or a Supabase error → `302` to `/auth/error`

### Implementation for User Story 3

- [ ] T036 [US3] Migration `supabase/migrations/<ts>_sign_in_attempts.sql`: table, settings columns, `allow_sign_in_attempt`, and the cleanup added to the existing cron job from `20261019131122_cron_jobs.sql` (T032 passes)
- [ ] T037 [P] [US3] Implement `src/lib/auth/sign-in-limits.ts` per T033
- [ ] T038 [US3] Rewrite `src/app/api/guest/sign-in/route.ts` per T034 and research R5: service-role lookup in `household_contacts`, `allowSignInAttempt`, `generateLink` for the household Auth user, `renderTemplate("magic_link", …)`, `sendEmail` from `src/lib/email/send.ts`; keep the per-IP limiter and `withMinimumDuration`; remove the per-address in-memory limiter now covered by the database
- [ ] T039 [US3] Implement `src/app/auth/confirm/route.ts` per T035, sharing the redirect rule with `/i/[token]` and `/auth/callback`

**Checkpoint**: a guest can always get back in from a new device with any household address.

---

## Phase 6: User Story 4 - Couple manages households' email addresses and links (Priority: P1)

**Goal**: staff add, edit and remove addresses, import several per household, copy and reissue links, and sign a household out everywhere.

**Independent test**: through the admin console, give a household two addresses, remove one, reissue its link (old link fails, new works), sign it out everywhere (both browsers get `401`), import a file with `contact_email_2` and a repeated address.

### Tests for User Story 4

- [ ] T040 [P] [US4] Complete `supabase/tests/database/170-household-sessions.test.sql`: `revoke_household_sessions(household_id)` deletes only that household Auth user's sessions and is executable only by the service role; `current_household_id()` returns null, and the guest policies on `households`, `household_contacts`, `guests` and `invitations` return nothing, for a request whose `session_id` claim is not in `auth.sessions`; a live session still works
- [ ] T041 [P] [US4] Add to `supabase/tests/database/160-invite-links.test.sql`: `reissue_invite_link(household_id)` increments `invite_link_version`, sets `invite_link_issued_at`, is staff-only (couple and planner), and is audited
- [ ] T042 [P] [US4] Write `src/app/api/admin/households/[id]/contacts/__tests__/route.test.ts` and `src/app/api/admin/households/[id]/contacts/[cid]/__tests__/route.test.ts` per contracts/admin-api.md: add (`201`), change (`200`, clears the flag), remove (`200` with `paper_only` when it was the last), `409 email_in_use` and `409 staff_account`, `401` and `403` for non-staff, `404` for an unknown household or contact; no address in any error body
- [ ] T043 [P] [US4] Write `src/app/api/admin/households/[id]/invite-link/__tests__/route.test.ts`: `GET` returns `{ url, issued_at }` for the current version with `Cache-Control: no-store`; `POST` reissues and returns the new URL, after which the old token fails `parseInviteToken`'s version check; both staff roles allowed; `401`, `403`, `404`
- [ ] T044 [P] [US4] Write `src/app/api/admin/households/[id]/sign-out/__tests__/route.test.ts`: staff → `204` and `revoke_household_sessions` called; `401`, `403`, `404`
- [ ] T045 [P] [US4] Add to `src/app/api/admin/staff/__tests__/route.test.ts`: granting staff access to an address that is a household contact returns `409 household_contact`
- [x] T046 [P] [US4] Add to `src/lib/guests/__tests__/import.test.ts`: `contact_email` plus any `contact_email_2`, `contact_email_3`, … columns are read per household; an invalid or repeated address (within the file or already on another household) is reported by row and column and the household is skipped; differing address sets across rows of one household are an error, as `contact_email` differences are today; both CSV and `.xlsx`
- [ ] T047 [P] [US4] Write component tests in `src/components/admin/__tests__/` for `ContactsList.tsx` (add, edit, remove, delivery flag, last-address warning), `InviteLinkControls.tsx` (copy, reissue with confirmation text that the old link stops and the new one must be sent) and `SignOutEverywhereForm.tsx` (confirmation)

### Implementation for User Story 4

- [ ] T048 [US4] Migration `supabase/migrations/<ts>_household_sessions.sql`: `revoke_household_sessions` (security definer, service role only, deletes from `auth.sessions`), and `current_household_id()` plus the guest select policies changed to require `auth.jwt() ->> 'session_id'` to exist in `auth.sessions` (T040 passes)
- [ ] T049 [US4] Migration `supabase/migrations/<ts>_reissue_invite_link.sql`: `reissue_invite_link` (T041 passes)
- [ ] T050 [P] [US4] Implement `src/app/api/admin/households/[id]/contacts/route.ts` and `src/app/api/admin/households/[id]/contacts/[cid]/route.ts` with schemas in `src/lib/admin-api/schemas.ts` and wrappers in `src/lib/admin-api/client.ts`
- [ ] T051 [P] [US4] Implement `src/app/api/admin/households/[id]/invite-link/route.ts` (uses `inviteLinkUrl`)
- [ ] T052 [P] [US4] Implement `src/app/api/admin/households/[id]/sign-out/route.ts`
- [ ] T053 [P] [US4] Change `src/app/api/admin/staff/route.ts` per T045
- [x] T054 [P] [US4] Change `src/lib/guests/import.ts` per T046 and update `scripts/sample-guests.csv` with a fake `contact_email_2` example
- [ ] T055 [US4] Build `src/components/admin/ContactsList.tsx`, `src/components/admin/InviteLinkControls.tsx` and `src/components/admin/forms/SignOutEverywhereForm.tsx`; delete `src/components/admin/forms/ContactEmailForm.tsx`; add Server Actions in `src/lib/admin/actions/households.ts`; wire them into `src/components/admin/HouseholdDetailView.tsx` and `src/app/(admin)/admin/(console)/households/[id]/page.tsx`; plain markup, styles only in `src/app/(admin)/admin.css`
- [ ] T056 [US4] Show address count and paper-only marker in `src/components/admin/HouseholdsListView.tsx` (data in `src/lib/admin/data/households.ts`) with tests
- [ ] T057 [US4] Settings: wedding event selector and sign-in limits in `src/components/admin/SettingsView.tsx`, `src/lib/admin/actions/settings.ts`, `src/lib/admin/data/settings.ts`; overview warning when no wedding event is chosen in `src/components/admin/OverviewView.tsx` and `src/lib/admin/data/overview.ts`; tests for each
- [ ] T058 [US4] Import page help text listing the extra address columns in `src/app/(admin)/admin/(console)/import/` and `src/components/admin/ImportResultView.tsx`

**Checkpoint**: staff can run the whole address and link lifecycle from the console.

---

## Phase 7: User Story 5 - Invitations and reminders carry the personal link (Priority: P2)

**Goal**: campaigns send one email per address, each with the household's personal link, exactly once even on retry.

**Independent test**: an invitation campaign to a household with two addresses and a paper-only household sends two emails with the link and records one `no_email` skip; retrying sends nothing.

### Tests for User Story 5

- [ ] T059 [P] [US5] Write `supabase/tests/database/550-messages-per-contact.test.sql`: `messages.contact_id` references `household_contacts` with `on delete set null`; unique nulls not distinct (`campaign_id`, `household_id`, `contact_id`); enqueue creates one `queued` row per contact of each deliverable household and one `skipped` row (`contact_id` null) for paper-only or opted-out households; re-running enqueue adds nothing; claiming a row whose contact was removed marks it `skipped` with `no_email`; `to_email` is the contact's current value at claim time
- [ ] T060 [P] [US5] Update `src/lib/campaigns/__tests__/dispatch.test.ts` and `audience.test.ts`: per-address sends with `Idempotency-Key = message.id`; response counts `{ campaign_id, households, addresses, queued, sent, skipped: { no_email, opted_out, other }, failed }`
- [ ] T061 [P] [US5] Update `src/lib/campaigns/__tests__/props.test.ts` and `src/lib/email/__tests__/templates.test.ts`: `CampaignProps.personal_link` is the household's `/i/<token>` URL for its current version; still no address, postal address, dietary data or notes in props
- [ ] T062 [P] [US5] Write `emails/__tests__/invitation.test.tsx` and `emails/__tests__/rsvp-reminder.test.tsx`: each renders `{ subject, html, text }` from fixture props; `personal_link` appears in both bodies; `invitation` includes the household name, events and `respond_by`; `rsvp_reminder` includes `respond_by` and what is pending; no prop outside the contract is read
- [ ] T063 [P] [US5] Update `src/components/admin/__tests__/` for `AudiencePreviewView.tsx` and `DeliveryView.tsx`: per-household email counts, per-address rows, skip reasons

### Implementation for User Story 5

- [ ] T064 [US5] Migration `supabase/migrations/<ts>_messages_per_contact.sql`: `messages.contact_id`, the new unique constraint, and changes to `resolve_audience`, the enqueue step and `claim_campaign_messages` (T059 passes)
- [ ] T065 [US5] Update `src/lib/campaigns/dispatch.ts`, `src/lib/campaigns/audience.ts` and `src/app/api/admin/campaigns/[id]/send/route.ts` per T060
- [ ] T066 [US5] Add `personal_link` to `CampaignProps`, `CampaignPropsSource` and `buildCampaignProps` in `src/lib/email/templates.ts`, and pass it from `src/lib/campaigns/props.ts` (T061)
- [ ] T067 [P] [US5] Write first-draft plain templates `emails/invitation.tsx` and `emails/rsvp-reminder.tsx` with `@react-email/components` (wording for Chris to polish; no brand styling), and register `invitation` and `rsvp_reminder` in `emails/index.ts` (T062)
- [ ] T068 [US5] Update `src/components/admin/AudiencePreviewView.tsx`, `src/components/admin/DeliveryView.tsx` and `src/lib/admin/data/campaigns.ts` per T063

**Checkpoint**: invitations deliver personal links; together with US1 this is the guest-facing MVP.

---

## Phase 8: User Story 6 - Sign-in emails come from the repository's own templates (Priority: P2)

**Goal**: the `magic_link` template is registered and used for guests (US3) and staff (Send Email hook); the custom SMTP stopgap is retired without a gap.

**Independent test**: with the template registered, a guest sign-in request and a staff sign-in through the hook each produce an email rendered from it; Supabase's own wording is never sent.

### Tests for User Story 6

- [ ] T069 [P] [US6] Write `emails/__tests__/magic-link.test.tsx`: renders `{ subject, html, text }`; `sign_in_url` appears in both bodies; wording differs for `audience: "guest"` and `"staff"`
- [ ] T070 [P] [US6] Add to `src/app/api/auth/send-email/__tests__/route.test.ts`: with `magic_link` registered, a signed staff payload sends one email rendered with `audience: "staff"`; existing signature, missing-template and ignored-action cases still pass

### Implementation for User Story 6

- [ ] T071 [US6] Write the first-draft plain template `emails/magic-link.tsx` and register `magic_link` in `emails/index.ts` (T069, T070)
- [ ] T072 [US6] Update `docs/manual-setup.md` with the switch-over in order (research R9 and quickstart.md section 4): set `SEND_EMAIL_HOOK_SECRET`; turn on the Send Email hook; prove a staff sign-in email arrives rendered from the template; only then remove custom SMTP; record what was done; and replace the "stopgap" entry accordingly
- [ ] T073 [US6] Add a dated note to `docs/decisions/0004-auth-emails-via-resend.md`: guests' sign-in emails are now sent by the site's sign-in route (still the registered template and Resend); the hook carries staff sign-in email only

**Checkpoint**: all sign-in email comes from repository templates once the switch-over is done in production.

---

## Phase 9: User Story 7 - Couple tracks delivery per address and follows up (Priority: P3)

**Goal**: a bounce or complaint flags the address and its household; correcting or removing the address clears it.

**Independent test**: a bounce webhook for one of two addresses flags that address and the household only; editing the address clears both.

### Tests for User Story 7

- [ ] T074 [P] [US7] Add to `supabase/tests/database/530-message-events.test.sql`: `record_message_event` for a bounce or complaint sets `household_contacts.delivery_problem` on the contact whose `value` still equals the message's `to_email`, and not on others; duplicates and out-of-order events end in the correct state, as today
- [ ] T075 [P] [US7] Add to `src/app/api/webhooks/resend/__tests__/route.test.ts` and `src/components/admin/__tests__/` (`OverviewView`, `ReportsView`, `ContactsList`): a flagged address shows on the household and in the delivery-problem counts with which address failed (masked in lists, full in the household detail)

### Implementation for User Story 7

- [ ] T076 [US7] Migration `supabase/migrations/<ts>_contact_delivery_flags.sql`: change `record_message_event` per T074
- [ ] T077 [US7] Update `src/lib/admin/data/overview.ts`, `src/lib/admin/data/reports.ts`, `src/components/admin/OverviewView.tsx`, `src/components/admin/ReportsView.tsx` and `src/components/admin/ContactsList.tsx` per T075

**Checkpoint**: follow-up works per address.

---

## Phase 10: Polish and cross-cutting concerns

- [ ] T078 [P] Update `specs/001-guest-data-model/contracts/guest-api.md` and `docs/guest-api.md` with the changes in `specs/003-personal-invite-links/contracts/guest-api.md`, and extend `src/lib/guest-api/__tests__/contract.test.ts` so the endpoint table includes `/i/[token]` and `/auth/confirm`
- [ ] T079 [P] Update `specs/001-guest-data-model/contracts/admin-api.md`, `specs/001-guest-data-model/contracts/http-endpoints.md`, `specs/002-admin-console-v0/contracts/admin-routes.md` and `docs/admin-api.md` with `specs/003-personal-invite-links/contracts/admin-api.md`
- [ ] T080 [P] Update `specs/001-guest-data-model/contracts/email-templates.md` with `specs/003-personal-invite-links/contracts/email-templates.md`
- [ ] T081 [P] Write the decision record for guest identity (one shared Auth user per household with a synthetic address, personal invite links, typed-address links sent by the site) as `docs/decisions/0011-household-sign-in-and-invite-links.md`, superseding the guest-identity decision; mark `docs/decisions/0003-guest-identity.md` as superseded with a link
- [ ] T082 [P] Write the decision record for shared household access (several addresses, any signed-in member answers) as `docs/decisions/0012-shared-household-access.md`; add a note to `docs/decisions/0006-household-model.md` that its "exactly one responder" part is superseded, the rest stands; update `docs/architecture.md` items 2 and 3
- [ ] T083 [P] Update `docs/manual-setup.md`: `INVITE_LINK_SECRET` (sensitive, production), `HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN`, choosing the wedding event, the sign-in limits and their defaults, the conversion script and when to run it
- [ ] T084 [P] Update `CLAUDE.md` layout table entries for the new routes (`src/app/i`, `src/app/auth/confirm`) and `specs/001-guest-data-model/data-model.md` with a pointer to this feature's data model
- [ ] T085 Run every scenario in `specs/003-personal-invite-links/quickstart.md` section 3 locally and record any deviation in `research.md`
- [ ] T086 Final gate: `npm run format:check && npm run lint && npm run type-check && npm test && npm run test:db`, and `npm run build`

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: none. T002 to T004 decide fallbacks that later tasks use.
- **Foundational (Phase 2)**: after Setup; blocks every story.
- **User stories (Phases 3 to 9)**: after Foundational. Priority order US1 → US2 → US3 → US4 → US5 → US6 → US7, or in parallel where noted below.
- **Polish (Phase 10)**: after the stories it documents.

### User story dependencies

- **US1** (personal link): Foundational only.
- **US2** (shared access): Foundational only.
- **US3** (typed-address link): Foundational only; tests use a fixture `magic_link` template, so it does not wait for US6.
- **US4** (staff management): Foundational; the invite-link routes use `src/lib/auth/invite-link.ts` from US1 (T023).
- **US5** (campaigns): Foundational; `personal_link` uses T023 from US1.
- **US6** (sign-in templates): none beyond Foundational; its production switch-over should follow US3 so guests no longer depend on Supabase email.
- **US7** (delivery per address): US5's per-contact messages (T064).

### Within each story

Tests first and failing → migration → `npm run db:reset` and `npm run db:types` → helpers → routes → admin console → story checkpoint with the suite green.

### Parallel opportunities

- Setup: T002 to T004 together once T001 is in.
- Foundational: T005 to T009 together (different files); T014 and T015 alongside T012.
- After Foundational: US1, US2 and US3 can proceed in parallel; US4 and US5 once T023 exists.
- Within a story, every task marked [P] touches different files.

## Parallel example: User Story 1

```text
Together: T018 (invite-link helper tests), T019 (pgTAP invite links), T020 (/i route tests), T021 (deadline_passed tests)
Then:     T022 (migration) and T023 (helper) in parallel
Then:     T024 (/i route), T025 (deadline_passed), T026 (docs)
```

## Implementation strategy

### MVP first

1. Setup and Foundational (T001 to T017).
2. US1 (T018 to T026): personal links work.
3. US4's link controls (T043, T051, and the copy button in T055) let staff hand out links before campaigns are ready.
4. Stop and validate with quickstart.md: this is the smallest version a guest can use.

### Incremental delivery

1. MVP above.
2. US2 and US3: shared households and getting back in on a new device.
3. Rest of US4: full address management, sign out everywhere, import columns.
4. US5: invitations carry the link automatically.
5. US6: sign-in emails from templates, then the production switch-over.
6. US7: per-address follow-up.
7. Polish: contracts, decision records, docs, final gate.
