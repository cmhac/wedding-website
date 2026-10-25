# Quickstart: validating the admin console v0

A walkthrough that proves the console works end to end against a local database. It also serves as the checklist for success criterion SC-001 (every capability in the admin API handoff document can be used from the console) and SC-009 (the team rehearses the whole flow and records gaps).

## Prerequisites

1. Docker running, then `npm run db:start` (local Supabase) and `npm run db:reset` (applies migrations and the fake seed data).
2. `.env.local` copied from `.env.example` with the local Supabase values. Sign-in emails are not really sent locally: Supabase's local email testing server shows them at `http://127.0.0.1:54324` (`[local_smtp]` in `supabase/config.toml`).
3. Two staff accounts, one couple and one planner: `node --env-file=.env.local scripts/create-staff-user.ts <email> <display name> <couple|planner>`.
4. `npm run dev`, then open `http://localhost:3000/admin`.

## Automated checks (run before every push)

```bash
npm run format:check && npm run lint && npm run type-check && npm test
npm run test:db     # includes the new meal-history column test
npm run build       # the app now has pages, so CI builds it
```

## Walkthrough

Each step names the page and the requirement it proves. "Expect" says what you should see.

### 1. Access (FR-001 to 003)

1. Open `/admin` signed out. Expect: sent to `/admin/sign-in`, no data shown.
2. Request a link for the couple's email. Expect: the same neutral message you would see for an unknown address. Open the link from the local email testing page. Expect: the overview.
3. Open `/admin/households` in a private window while signed in as a **guest** account (create one by importing a household and signing in as it). Expect: "You do not have access to this", no data.
4. Click Sign out. Expect: `/admin/sign-in`; the back button shows no data.
5. Open a used link a second time. Expect: the `/auth/error` page.

### 2. Overview (FR-004)

Expect per-event invited, attending, declined and pending counts that match `npm run db:reset` seed data, and the follow-up counts (required, optional, meals, delivery problems, paper only, duplicates).

### 3. Households and guests (FR-005 to 009, 017)

1. Search by a household name, then by a guest's name. Expect: matching households only.
2. Create a household with two guests and an allowance of 1. Expect it in the list.
3. Create another with the same contact email. Expect: a plain "already belongs to another household" message and the form still filled in.
4. Open the household, change the allowance below the number of named plus-ones. Expect: the refusal in plain words.
5. Add a dietary need to a guest. Expect it on the Guests tab and in the dietary report later.
6. Open the duplicates view. Expect: flagged pairs, nothing merged.
7. Delete a household: Remove tab, type its name. Expect: gone from the list; its sign-in account is gone too.

### 4. Import (FR-010)

1. Import `scripts/sample-guests.csv`. Expect: created counts.
2. Save the same data as `.xlsx` (and make a second sheet), import it. Expect: identical counts and "read the first of 2 sheets".
3. Break three rows (bad email, repeated email, unknown event key) and import both formats. Expect: the same three errors with the same row numbers.
4. Upload a text file renamed to `.xlsx`. Expect: the whole-file error.

### 5. Events, invitations, answering on behalf (FR-011 to 013a)

1. Create an optional event, invite two guests. Expect: pending invitations.
2. Record one attending and one declined **as staff**. Expect: overview counts change; each answer says "Recorded by staff" with your name and a Pacific time.
3. Sign in as that household (guest) and change the answer. Expect: it now says "Guest", and History shows both steps with the right source.
4. Close RSVPs in Settings, then record an answer as staff. Expect: accepted.

### 6. Menus (FR-014 to 016)

Build a menu with two courses and three dishes, tag one dish, publish it. Choose a dish for a guest, then archive that dish. Expect: the affected guests listed, the dish gone from choices.

### 7. Campaigns (FR-018 to 022)

1. Create a draft aimed at households with unanswered required events. Expect: the preview lists who gets it and who is skipped with reasons.
2. Save with no filters chosen. Expect: the plain error, nothing saved.
3. Send now. Expect: the confirmation step first. With no template registered, expect the "no template" message and nothing sent.
4. After a send, expect: read-only, with delivery status per household.

### 8. Reports, exports, history (FR-023 to 025)

Open each report and compare with the data. Download the three CSV files. Make a change, then find it in the change log with the right name and the field names (never values).

### 9. Settings and staff (FR-026, 027, 003)

1. Change the default deadline and the RSVPs-open switch. Expect them to persist.
2. As a planner: expect staff shown but no grant or remove controls.
3. As a couple member: grant planner access, sign in as the planner, record a meal choice for a household as the planner, then revoke the planner's access. Expect: the planner's next request is refused, and the household's Answers tab and the meal history still say "Recorded by staff" with the planner's role (and "Staff (former member)" where the name is gone), not "Unknown".
4. Try to remove the last couple member. Expect: the plain "last couple member" message.

### 10. Times (FR-032 and the time-zone assumption)

Create an event at 4:00 PM on a date inside daylight saving time and another outside it. Expect: both show "4:00 PM PT" on every screen regardless of the computer's own time zone. Check one at a different system time zone.

### 11. Phone width and keyboard (FR-032)

Narrow the window to about 390 px. Expect: a top bar with a menu, tables as stacked rows, no sideways scrolling except the tab row. Complete a household edit with the keyboard only.

## Recording gaps (SC-009)

While rehearsing, add anything missing or awkward to `data-model.md`, "Gaps found", rather than working around it.
