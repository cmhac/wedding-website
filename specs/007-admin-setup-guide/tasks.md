# Tasks: Admin setup guide

**Input**: design documents in `specs/007-admin-setup-guide/` (spec, plan, research, data model, contracts, quickstart, design mockups)

**Tests**: required (the constitution is test-first). Each implementation task is preceded by its failing test task.

**Format**: `- [ ] T### [P?] [Story?] description with file path`. `[P]` means a different file with no dependency on an unfinished task.

## Phase 1: Setup

- [ ] T001 Create the folder `src/lib/setup/` with an empty `__tests__/` and add the one line for it to the Layout table in `CLAUDE.md` ("`src/lib/setup` | Admin setup guide: step catalogue, status, banner mode")

## Phase 2: Foundational (blocks every story)

- [ ] T002 [P] Write failing tests for the step catalogue in `src/lib/setup/__tests__/steps.test.ts`: the eleven keys and their order from `contracts/setup-guide.md`; exactly five required (`site_url`, `wedding_event`, `email_sending`, `link_key`, `schedule_key`); every step has a purpose, an "if unset" line and a kind; `outside` steps name the hosting values to set; only `texting` carries a couple-only change rule; keys match `^[a-z0-9_]{1,40}$`
- [ ] T003 Implement the catalogue in `src/lib/setup/steps.ts` (pure, no I/O) so T002 passes
- [ ] T004 [P] Write failing tests for `evaluateSetup` in `src/lib/setup/__tests__/status.test.ts`: every step done and open case from the contract's "Done when" column; a malformed site address is open with a reason; `wedding_event` is open when the event has no date; `texting` is open when configured but switched off; `rsvp_closed` is done when the RSVP is closed or confirmed left open; a `manual` step is done only when its key is in `confirmed`; secrets arrive as booleans and the output never contains a value; counts `requiredOpen`, `requiredTotal`, `recommendedOpen`
- [ ] T005 Implement `evaluateSetup` in `src/lib/setup/status.ts` so T004 passes
- [ ] T006 [P] Write failing tests for `bannerMode` in `src/lib/setup/__tests__/banner.test.ts`: hidden when no required step is open (even if `left_guide`); full when `left_guide` is false; compact when `left_guide` and every open required key is in `seen_required`; full again when an open required key is missing from `seen_required`; skipped steps still count as open
- [ ] T007 Implement `bannerMode` and the guide-state type in `src/lib/setup/banner.ts` so T006 passes
- [ ] T008 Write the failing pgTAP test `supabase/tests/database/600-setup-guide.test.sql` (`select * from no_plan();`): both tables exist with RLS on; a staff member can insert, read, update and delete only their own `setup_guide_state` row; another staff member cannot read or change it; a guest and anon cannot touch either table; `skipped_steps` over 30 elements or a key not matching `^[a-z0-9_]{1,40}$` is refused; staff can insert, read and delete `setup_confirmations`; a guest cannot; deleting the user nulls `confirmed_by`
- [ ] T009 Add the migration `supabase/migrations/20261112120000_setup_guide.sql` with `setup_guide_state` (columns and checks exactly as in `data-model.md`, `updated_at` trigger) and `setup_confirmations`, RLS enabled, policies per the data model, so T008 passes (CI runs it; Docker is not available here)
- [ ] T010 [P] Write failing tests for the server loader in `src/lib/setup/__tests__/load.test.ts` using fake clients: it reads settings, the person's guide state and confirmations in parallel; maps environment presence to booleans; returns status plus banner mode; on any read error returns `null`, logs only the failing read's name through `src/lib/log.ts`, and never logs a value; no secret value appears in the result
- [ ] T011 Implement `src/lib/setup/load.ts` (`server-only`) and the shared fact helpers in `src/lib/setup/facts.ts` (wedding date, site address, email key presence) so T010 passes, and make `src/lib/campaigns/readiness.ts` use `facts.ts` for the facts it shares, keeping its existing tests green

**Checkpoint**: the pure model, tables and loader are done; the stories can build on them.

## Phase 3: User Story 1 - See what is missing and be led through it (P1) 🎯 MVP

**Goal**: banner on every console page while a required step is open, and a guide that walks the steps and marks them done on its own.

**Independent test**: with a required value missing, any console page shows the banner; the guide opens on the first open step; setting a value marks it done; the banner goes when the last required step is done.

- [ ] T012 [P] [US1] Write failing component tests in `src/components/admin/__tests__/SetupGuide.test.tsx`: full banner shows "Setup isn't finished: N of M required steps done" and a "Start setup" button; nothing renders when mode is hidden; the panel opens as a named dialog with the step list (done, current, open markers each with text, not colour alone) and a progress line; the current step shows purpose and "If you leave this unset"; an `outside` step shows the hosting value names and "Check again" and has no input for a secret; `aria-live` status announces a step becoming done
- [ ] T013 [US1] Implement `src/components/admin/SetupGuide.tsx` (client) per the mockups in `specs/007-admin-setup-guide/design/`: banner, panel as a native `<dialog>` opened with `showModal()`, step list, step detail, polite live region; opening state from the `setup` search parameter; styles added to `src/app/(admin)/admin.css` (banner, panel, bottom sheet under 600px, step markers) using the existing tokens
- [ ] T014 [P] [US1] Write failing tests in `src/lib/admin/actions/__tests__/setup.test.ts` for `checkAgain` (staff only; revalidates the layout; returns the fresh status of one step; refuses an unknown key; returns no secret value)
- [ ] T015 [US1] Implement `checkAgain` in `src/lib/admin/actions/setup.ts` using the existing session guard and `runAdminAction`, so T014 passes
- [ ] T016 [US1] Render the console steps' forms inside the guide: the wedding event step reuses the Settings form field and `saveSettings`; after a save the layout revalidates and the guide moves to the next open step (test in `SetupGuide.test.tsx`: saving a valid event marks the step done, an invalid value shows the Settings error text and does not mark it done)
- [ ] T017 [US1] Wire the layout: in `src/app/(admin)/admin/(console)/layout.tsx` call `loadSetup`, pass status, banner mode and the person's role to `SetupGuide`, and remove `SmsBanner` (delete `src/components/admin/SmsBanner.tsx` and its test); a `null` result renders no banner; add a layout test that a failed load still renders the page (FR-028)
- [ ] T018 [P] [US1] Remove the texting banner expectations from the existing tests that name it and add the replacement expectation (the texting step is recommended and never raises the banner)

**Checkpoint**: a new staff member can finish required setup from the guide.

## Phase 4: User Story 2 - Leave the guide and come back (P1)

**Goal**: leaving never loses saved values; a compact reminder stays; resume returns to the right step; state follows the person.

**Independent test**: finish one step, close the guide on the next with Escape, reload, then resume.

- [ ] T019 [P] [US2] Write failing tests in `src/lib/admin/actions/__tests__/setup.test.ts` for `leaveGuide` (sets `left_guide` and `seen_required` to the current required keys, saves `last_step`), `resumeGuide`, `skipStep` (adds the key, moves `last_step` to the next open step, refuses an unknown key, a skipped step still counts as open), `recordPosition`, and that every action is staff only and writes only the caller's own row
- [ ] T020 [US2] Implement those actions in `src/lib/admin/actions/setup.ts` so T019 passes
- [ ] T021 [P] [US2] Write failing component tests in `SetupGuide.test.tsx`: close button, Escape and "Not now" each call `leaveGuide` and return focus to the opener; compact reminder shows "Setup paused", progress and skipped count with "Resume setup" and "Restart"; "Resume setup" opens on `last_step` or the first open step when that one is done; "Skip this step" marks skipped and moves on; a new required step brings the full banner back
- [ ] T022 [US2] Implement leave, skip, resume and the compact reminder in `SetupGuide.tsx` so T021 passes
- [ ] T023 [US2] Add a loader test and fix in `src/lib/setup/load.ts` that the same person on another browser sees the same mode and skips (state is read from the person's row, not the browser)

## Phase 5: User Story 3 - Restart the guide (P2)

**Goal**: restart clears the person's skips and position, never site values; a standing link opens the guide any time.

**Independent test**: skip two steps, restart, both reappear open; with setup complete the standing link opens the guide with "Change" controls.

- [ ] T024 [P] [US3] Write failing tests for `restartGuide` (deletes only the caller's row, changes no site value) in `src/lib/admin/actions/__tests__/setup.test.ts`
- [ ] T025 [US3] Implement `restartGuide` in `src/lib/admin/actions/setup.ts` so T024 passes
- [ ] T026 [P] [US3] Write failing tests in `src/components/admin/__tests__/AdminShell.test.tsx` and `SetupGuide.test.tsx`: a "Setup guide" nav link is always present; it shows "N left" while required steps are open and "N recommended" when only recommended remain; it opens the guide; with setup complete each step shows done with "Change"; a value removed later brings the banner back
- [ ] T027 [US3] Add the nav link, count and "Restart setup" to `src/components/admin/AdminShell.tsx` and `SetupGuide.tsx` so T026 passes

## Phase 6: User Story 4 - Recommended steps do not nag (P3)

**Goal**: recommended steps appear in the guide but never in the banner.

**Independent test**: with every required step done and a recommended one open, there is no banner and the guide lists it under "Recommended".

- [ ] T028 [P] [US4] Write failing tests in `SetupGuide.test.tsx` and `banner.test.ts`: recommended-only open means mode hidden; the guide shows the "Required" and "Recommended" groups; the "Setup complete" message names the recommended count; the planner sees the texting switch step read-only with "Only the couple can change this" and can skip it; a manual step has "I've done this" and "Undo" using `confirmStep` and `unconfirmStep`
- [ ] T029 [US4] Implement the groups, the role-aware read-only state and the manual step controls, and `confirmStep` / `unconfirmStep` in `src/lib/admin/actions/setup.ts` (refuse a key whose kind is not `manual`; tests in `setup.test.ts`), so T028 passes

## Phase 7: Polish and cross-cutting

- [ ] T030 [P] Add an accessibility test file `src/components/admin/__tests__/SetupGuide.a11y.test.tsx`: the dialog has an accessible name, every control is a real button, icon-only buttons have labels, focus moves into the guide on open and is restored on close, the full banner is `role="status"`
- [ ] T031 [P] Add a secrets test in `src/lib/setup/__tests__/no-secrets.test.ts`: render the layout and guide with environment values set to a sentinel string and assert the sentinel appears in no rendered output, no stored row and no log call (SC-007)
- [ ] T032 [P] Write the decision record `docs/decisions/0016-admin-setup-guide.md` (guide design, per-person server state, replacing the texting banner, no secrets in the console) and link it from `docs/architecture.md`
- [ ] T033 [P] Update `docs/manual-setup.md` so its intro says the guide shows what is left and checks it, and keep the detailed steps as the reference the guide's instructions point at
- [ ] T034 Run `npm run format:check && npm run lint && npm run type-check && npm test && npm run build` and fix anything they report
- [ ] T035 Walk `quickstart.md` by hand in the dev server if the environment allows; otherwise record in the pull request which steps could not be run

## Dependencies and order

- Phase 2 blocks everything. Within it: T002→T003, T004→T005, T006→T007, T008→T009, T010→T011; the five pairs are independent of each other.
- US1 (T012–T018) first; it is the MVP.
- US2 (T019–T023) builds on the guide component from US1.
- US3 (T024–T027) and US4 (T028–T029) can follow in either order after US2.
- Polish last.

## Parallel examples

- Phase 2: T002, T004, T006, T008 and T010 are all new test files and can be written together.
- US1: T012 and T014 and T018 can be written together before their implementations.

## Implementation strategy

MVP is Phase 2 plus US1: required steps show a banner and a guide that completes them. Add US2 next because the user asked for leave and resume directly, then US3, US4 and polish. Docker is not available here: the database test in T008 is verified by CI, and generating the database types stays a follow-up for a machine with Docker.
