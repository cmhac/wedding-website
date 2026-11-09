---
description: "Task list for the placeholder homepage"
---

# Tasks: Placeholder homepage

**Input**: Design documents from `specs/004-placeholder-homepage/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. The constitution's first principle is test-first: every test task below is written and seen failing before the implementation task that follows it. There is no database change, so there are no pgTAP tests. Code gets Jest tests in `__tests__` directories next to the source.

**Organization**: By user story from the spec. Phase 2 holds the changes every story relies on; after it, each story can be built and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the spec's user story (US1 to US4)
- "Research Rn" points to the decision of that number in [research.md](./research.md).
- No new environment variables, no migrations, no generated files touched.

---

## Phase 1: Setup

**Purpose**: confirm the starting point so new failures are attributable.

- [ ] T001 Run `npm test`, `npm run lint` and `npm run type-check` on the branch and note the result in the pull request description. `npm run format:check` already reports 7 files that this feature does not touch (for example `src/lib/email/send.ts`); do not reformat them, and run Prettier only on files this feature changes

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared changes every story depends on: where sign-in lands, device-only sign-out, one staff-link helper, and the new route group with its layout and stylesheet.

- [ ] T002 [P] Tests first, in `src/lib/auth/__tests__/redirect.test.ts` and `redirect-config.test.ts`: `guestPath()` returns `/` by default and `GUEST_RSVP_PATH` still overrides it; `allowedNext("/", "guest")` returns `/`; `allowedNext("/", "staff")` returns `/`; `/admin` stays allowed for staff only; `//x`, `/rsvp/../x` and absolute URLs are still refused. Then change `DEFAULT_GUEST_PATH` to `"/"` in `src/lib/auth/redirect.ts` (Research R5). Update every existing test that expects a guest landing on `/rsvp` to expect `/`: `src/app/auth/__tests__/callback.test.ts`, `src/app/auth/callback/__tests__/route.test.ts`, `src/app/auth/confirm/__tests__/route.test.ts` and `src/app/i/[token]/__tests__/route.test.ts`, keeping at least one test per route that sets `GUEST_RSVP_PATH=/rsvp` to prove the override
- [ ] T003 [P] Test first in `src/app/api/guest/sign-out/__tests__/route.test.ts`: the route calls `supabase.auth.signOut` with `{ scope: "local" }`, still answers `204`, and still answers `204` when `signOut` throws. Then change `src/app/api/guest/sign-out/route.ts` to pass `{ scope: "local" }` (Research R7)
- [ ] T004 [P] Tests first in `src/lib/auth/__tests__/staff-sign-in.test.ts`: `requestStaffLink(supabase, address)` calls `signInWithOtp` with `shouldCreateUser: false` and `emailRedirectTo` of `${NEXT_PUBLIC_SITE_URL}/auth/callback?audience=staff`; it returns an outcome code (`"requested"` or an error code string) and never throws; it makes no Supabase call and returns `"household_account"` for an address whose domain is `HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN` (default `households.invalid`, case-insensitive), so nobody can ask for a link to a household's internal account. Then create `src/lib/auth/staff-sign-in.ts` (Research R3)
- [ ] T005 Change `src/app/api/admin/sign-in/route.ts` to call `requestStaffLink` from T004 instead of its inline `signInWithOtp`, keeping its per-address in-memory limiter, neutral message and 1.5 s floor. Existing tests in `src/app/api/admin/__tests__/sign-in.test.ts` must pass unchanged (add one case that an address on the household domain gets the neutral answer and no Supabase call)
- [ ] T006 [P] Create the route group `src/app/(site)`: `layout.tsx` (a root layout with `<html lang="en">`, `<body>`, metadata `{ title: "Hannah & Chris", robots: { index: false, follow: false } }`, and `import "./site.css"`) and `site.css` with plain CSS variables on `:root` for `font` (`Helvetica, Arial, sans-serif`), `bg`, `text`, `muted`, `border`, `focus`, `accent`, `accent-text`, `ok-bg`, `ok-text`, `bad-bg`, `bad-text`, a dark set under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and the same dark set under `:root[data-theme="dark"]`, `color-scheme: light dark`, no web fonts and no Tailwind directives (Research R1, R6, R10). Test first in `src/app/(site)/__tests__/site-css.test.ts` (mirror `src/app/(admin)/__tests__/admin-css.test.ts`): every token above exists in the first `:root` block, the dark set is defined both ways, and the file has no `@import`, no `@font-face` and no `@tailwind`/`@apply`
- [ ] T007 [P] Tests first in `src/lib/site/__tests__/theme.test.ts`, then create `src/lib/site/theme.ts`: `THEME_KEY = "theme"`; `parseTheme(value: unknown): "light" | "dark" | null` accepts only those two strings; `readSavedTheme(storage)` and `saveTheme(storage, theme)` catch every error (a throwing getter, a throwing `setItem`, `null` storage) and return `null` or do nothing; `THEME_INIT_SCRIPT` is a short string that sets `document.documentElement.dataset.theme` from `localStorage` inside try/catch and ignores any value other than `light` or `dark` (a test evaluates it in jsdom with saved `dark`, saved `light`, saved garbage and a throwing `localStorage`) (Research R6). Then add the script to `src/app/(site)/layout.tsx` as an inline `<script dangerouslySetInnerHTML>` in `<head>`, with `suppressHydrationWarning` on `<html>`

**Checkpoint**: `npm test` is green; guests land on `/`; guest sign-out ends one device; the site route group builds but has no page yet.

---

## Phase 3: User Story 1 - Signed-in person sees the placeholder (Priority: P1) 🎯 MVP

**Goal**: anyone with a guest or staff session who opens `/` sees "Coming soon 👀" centered, with a "Sign out" link.

**Independent Test**: sign in as a household and, separately, as staff; open `/` in each; the placeholder appears. (Until Phase 4 lands, signed-out visitors see an empty page, so do not deploy between the phases.)

- [ ] T008 [P] [US1] Tests first in `src/components/site/__tests__/placeholder.test.tsx`: `Placeholder` renders exactly one text node "Coming soon 👀" inside a `<main>`, plus a button named "Sign out" and nothing else visible (no heading, nav, footer, image, or other text); the line's wrapper has the class the stylesheet uses to centre it. Then create `src/components/site/Placeholder.tsx` (presentational; semantic class names only, no inline styles)
- [ ] T009 [P] [US1] Tests first in `src/components/site/__tests__/sign-out-button.test.tsx`: pressing the button calls the guest API client's `signOut()` once, then navigates to `/` (inject the navigate function so the test does not use `window.location`); it is disabled while the call is in flight; if the call rejects it still navigates to `/` (signing out never fails from the person's point of view). Then create `src/components/site/SignOutButton.tsx` (`"use client"`, a text-style `<button type="button">` using `createGuestApiClient()` from `src/lib/guest-api/client.ts`) (Research R7, FR-008a)
- [ ] T010 [US1] Tests first in `src/components/site/__tests__/home.test.tsx`: `Home` with `signedIn` true renders `Placeholder`; with `signedIn` false renders the sign-in prompt slot (a stub in this phase). Then create `src/components/site/Home.tsx` and `src/app/(site)/page.tsx`: the page is `async`, marked `export const dynamic = "force-dynamic"`, calls `getSession()` from `src/lib/auth/session.ts` inside try/catch (any error counts as signed out) and renders `<Home signedIn={session !== null} />` (Research R2, R10). Add the layout/centering rules for the placeholder's line, `main` and sign-out control to `src/app/(site)/site.css`: the line is centred vertically and horizontally with a full-height flex container (`min-height: 100dvh`), the controls sit in the top-right corner and never overlap the line, and no element other than those exists (FR-008, FR-009)
- [ ] T011 [US1] Add a test in `src/app/(site)/__tests__/layout.test.tsx` that the layout exports metadata with `robots.index === false` and renders the inline theme script (FR-017)

**Checkpoint**: User Story 1 works on its own for a signed-in visitor.

---

## Phase 4: User Story 2 - Visitor who is not signed in is prompted to sign in (Priority: P1)

**Goal**: one email prompt at `/` for guests and staff; one neutral answer; household address gets the household link, staff address gets the staff link.

**Independent Test**: in a fresh browser open `/`, request a link for a household address, open it, and land on the placeholder; repeat with a staff address and land on the admin console.

- [ ] T012 [P] [US2] Tests first in `src/app/api/guest/sign-in/__tests__/route.test.ts` (extend the existing file, keep its mocks): the neutral message is now "If that address is on the guest list or belongs to a staff account, a link is on its way." for every outcome; household address: household email sent, `requestStaffLink` not called (existing tests keep passing); address on neither list: `requestStaffLink` is called once with the trimmed address and no email is sent through Resend; `requestStaffLink` returning an error code or throwing still gives the same `202` and body; the attempt limit is checked before either branch and a refused attempt calls neither; the minimum duration of 1500 ms wraps every branch; logs hold only an outcome code (`"sent"`, `"staff_requested"`, `"unknown"`, `"limited"` and so on), never an address. Then change `sendLink` in `src/app/api/guest/sign-in/route.ts`: after the household lookup finds nothing, call `requestStaffLink` from T004 using `createServerSupabase()` (so the one-time-link verifier cookie is set on this response) and return its outcome as the log code (Research R3, R4)
- [ ] T013 [P] [US2] Test first in `src/lib/guest-api/__tests__/contract.test.ts` (extend): the sign-in response schema accepts the new message; the typed client's `signIn` still resolves `ok` on `202`. Update the message in `src/lib/guest-api/schemas.ts` only if the schema pins the text (it should not)
- [ ] T014 [P] [US2] Tests first in `src/components/site/__tests__/sign-in-prompt.test.tsx`: the prompt has a labelled email input ("Email address"), a submit button, and no link to a staff sign-in; submitting calls the injected sign-in function with the typed address; on success it shows the message returned by the API in a polite live region (`role="status"`) and keeps the form for another try; on `429` it shows "Too many attempts. Try again soon."; on a network failure it shows "Could not reach the server. Try again."; it never changes its wording depending on the address typed; the submit button is disabled while a request is in flight. Then create `src/components/site/SignInPrompt.tsx` (`"use client"`, uses `createGuestApiClient().signIn`, takes the client as an optional prop for tests), with a one-line first-draft heading "Sign in to see what's coming" and a one-line hint "Enter the email address we invited, and we'll send you a link." (plain first-draft text for Chris to polish)
- [ ] T015 [US2] Replace the stub in `src/components/site/Home.tsx` (T010) with `SignInPrompt`, update `src/components/site/__tests__/home.test.tsx`, and add prompt layout rules to `src/app/(site)/site.css` (centred column, form fields, focus ring from the `focus` token, status messages in the `ok` and `bad` tokens, readable in both themes) (FR-004, FR-013)
- [ ] T016 [P] [US2] Test first in `src/components/admin/__tests__/auth-error.test.tsx`: the failure page's link goes to `/` with the text "Back to sign in". Then change `src/components/admin/AuthError.tsx` (Research R11). The admin console's own sign-in page is unchanged

**Checkpoint**: User Stories 1 and 2 work: signed out sees the prompt, any sign-in ends on the right page.

---

## Phase 5: User Story 3 - Light/dark toggle follows the system and can be overridden (Priority: P2)

**Goal**: the placeholder starts in the device's theme, has a keyboard-reachable toggle, and remembers the choice.

**Independent Test**: device in dark shows dark; press the toggle, light; reload, still light; storage blocked still works for the visit.

- [ ] T017 [US3] Tests first in `src/components/site/__tests__/theme-toggle.test.tsx` (jsdom, `matchMedia` mocked): renders a `role="switch"` button named "Dark mode"; after mount `aria-checked` is `true` when `data-theme="dark"` is set on `<html>`, or, with no `data-theme`, when `prefers-color-scheme: dark` matches; pressing it sets `document.documentElement.dataset.theme` to the opposite theme, flips `aria-checked`, and writes the choice with `saveTheme`; with a throwing `localStorage` it still flips for the visit; it is reachable and operable with the keyboard (Enter and Space) (FR-010, FR-011). Then create `src/components/site/ThemeToggle.tsx` (`"use client"`; renders in a neutral state until mounted so server and client markup match, then reads the current theme) using `src/lib/site/theme.ts`
- [ ] T018 [US3] Update `src/components/site/__tests__/placeholder.test.tsx` and `src/components/site/Placeholder.tsx`: the placeholder now shows the toggle next to "Sign out" and nothing else. Add the toggle's styling (a small pill switch with a visible focus ring, readable in both themes, tap target of at least 44px) to `src/app/(site)/site.css`
- [ ] T019 [US3] Extend `src/app/(site)/__tests__/site-css.test.ts` with a check that the stylesheet changes colours only through the tokens (no hard-coded hex colours outside the two token blocks), so both themes stay in step (FR-012, FR-013)

**Checkpoint**: User Stories 1 to 3 work; the page has both themes.

---

## Phase 6: User Story 4 - Staff open the home page from the admin console (Priority: P2)

**Goal**: a first sidebar item opens `/` in a new tab.

**Independent Test**: sign in as staff, press "View home page", and see the placeholder in a new tab while the console stays open.

- [ ] T020 [US4] Tests first in `src/components/admin/__tests__/shell.test.tsx` and `console-shell.test.tsx`: `AdminShell` renders a link named "View home page" with `href="/"`, `target="_blank"` and `rel` containing `noopener`; in the sidebar it comes before the brand block (first in document order inside the `<aside>`); the phone drawer also has it, first inside the drawer; existing navigation, `aria-current` and sign-out tests still pass. Then change `src/components/admin/AdminShell.tsx` and add the `.home-link` rules to `src/app/(admin)/admin.css` (one plain stylesheet, existing tokens only; keep `admin-css.test.ts` and `presentation-separation.test.ts` passing) (Research R8, FR-020)
- [ ] T021 [P] [US4] Test in `src/components/admin/__tests__/auth-error.test.tsx` or a new `src/app/(admin)/__tests__/no-home-link-on-auth-pages.test.tsx` that the admin sign-in page and the failure page do not render the shell's home link (they do not use `AdminShell`) (spec scenario 3 for story 4)

**Checkpoint**: all four stories work.

---

## Phase 7: Polish and cross-cutting concerns

- [ ] T022 [P] Update the docs in the same change (constitution's documentation rule): `docs/guest-api.md` and `specs/001-guest-data-model/contracts/guest-api.md` (the default landing is `/`, the new sign-in message and the staff behaviour, sign-out ends this device only, the failure page links to `/`; keep the `GUEST_RSVP_PATH` note); `docs/architecture.md` and `README.md` (the placeholder homepage exception, with a link to decision 0013, the placeholder homepage decision); `docs/manual-setup.md` (note that `GUEST_RSVP_PATH` is unset in production and the designer sets it when the RSVP page exists)
- [ ] T023 [P] Add a no-staff-leak style test in `src/components/site/__tests__/no-data-leak.test.tsx`: rendering `Home` for a signed-out visitor contains no address, name or role text beyond the fixed copy (FR-014); and extend `src/app/api/guest/__tests__/no-staff-leak.test.ts` if it lists guest routes so the sign-in route's staff branch is covered
- [ ] T024 Run `npm run format:check` on the changed files only (`npx prettier --check <files>`), then `npm run lint`, `npm run type-check`, `npm test` and `npm run build` (the build matters because a new root layout is added; confirm `/` appears as a dynamic route and the admin routes are unchanged). Fix any failure at its cause; never skip or delete a test
- [ ] T025 Walk through [quickstart.md](./quickstart.md) against `npm run dev` (local Supabase needs Docker; if it is not available here, run the steps that need no database: signed-out prompt, theme, centring at phone, tablet and desktop widths, and the unknown-address answer, using Playwright with the pre-installed Chromium and `deviceScaleFactor` 1) and record what was and was not run in the pull request description
- [ ] T026 After the pull request is merged and deployed, verify production per the quickstart's production check: `https://hannahandchris.wedding/` shows the prompt (not "not found"), and a latest deployment `READY` through the `vercel` skill. This task is Chris's to confirm with a real sign-in; do not request real guest links

---

## Dependencies and execution order

- Phase 1, then Phase 2. Phase 2 blocks everything.
- Inside Phase 2: T002, T003, T004, T006 and T007 are independent; T005 needs T004; T007's layout step needs T006.
- US1 (Phase 3) needs Phase 2. US2 (Phase 4) needs US1's `Home` (T010) and T004. US3 (Phase 5) needs US1's `Placeholder` and T007. US4 (Phase 6) needs only Phase 2 (T020 is independent of the other stories).
- Do not merge between US1 and US2: signed-out visitors would see an empty page.
- Polish (Phase 7) last; T026 after merge.

## Parallel examples

- Phase 2: T002, T003, T004, T006, T007 together.
- Phase 3: T008 and T009 together, then T010.
- Phase 4: T012, T013, T014 and T016 together, then T015.
- Phases 5 and 6 can run side by side once Phase 3 is done (US4 only needs Phase 2).

## Implementation strategy

1. MVP: Phases 1 to 4 (guests and staff can sign in and see the placeholder; signed-out visitors get the prompt). This is the smallest thing that can be shown in production.
2. Add the theme toggle (Phase 5) and the admin sidebar item (Phase 6).
3. Finish with docs, the full check, and the quickstart (Phase 7).
