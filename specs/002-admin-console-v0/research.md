# Research: Admin Console v0

Decisions made while planning, with the reasons and the alternatives. External facts were checked against the sources listed under each decision on 2026-10-25. Where something could not be verified, it says so.

## R1. Page structure: a route group with its own root layout

**Decision.** Put every admin page, plus the `/auth/error` page, in a route group `src/app/(admin)/` that has its own root layout (`<html>`, `<body>`, the stylesheet). Do not add `src/app/layout.tsx`.

**Why.** The app has no root layout today (only route handlers), and Next.js requires one for any page. A top-level `app/layout.tsx` would be a decision that belongs to the designer's public site. Next.js documents that you can create several root layouts by using route groups, or by omitting `app/layout.js`. The same page says navigating between different root layouts causes a full page load, which is fine here because the admin console and the future public site are separate areas.

**Alternatives.** A single `app/layout.tsx` with admin styles scoped inside: rejected because it would put the admin stylesheet on the public site and force the designer to work around it.

**Source.** [Next.js docs: layout.js, "Root Layout"](https://nextjs.org/docs/app/api-reference/file-conventions/layout).

## R2. Where the "staff only" check lives

**Decision.** Every page and every server action checks the session itself, close to the data, through one helper (`requireStaffPage`, built on the existing `getSession`). The console layout reads the session only to show the person's name and role. Row-level security stays the real gate: all reads and writes run under the signed-in staff member's own session, never the service-role key.

**Why.** Next.js says layouts do not re-render on navigation, so a check in a layout is not run on every route change, and recommends checking near the data. It also says Server Actions should be treated like public endpoints and must do their own authorization.

**Alternatives.** Check only in the layout, or only in the existing request proxy: rejected for the reasons above. The proxy keeps refreshing the session cookie as it does now.

**Source.** [Next.js docs: Authentication, "Layouts and auth checks" and "Server Actions"](https://nextjs.org/docs/app/guides/authentication).

## R3. Reads, writes and the existing route handlers

**Decision.**

- **Reads:** Server Components call small functions in `src/lib/admin/` that use `createServerSupabase()` (the staff session). They return plain objects shaped for the screen.
- **Writes under row-level security** (events, menus, dishes, settings, guests, invitations, campaign drafts, staff answers): Server Actions in `src/lib/admin/actions/`. Each one checks the session, validates the form with zod, calls Supabase as the staff member, and revalidates the page.
- **The seven operations that need the server secret** (create, edit and delete household, import, send a campaign, grant and revoke staff, staff sign-in): small client components call the typed wrappers that already exist in `src/lib/admin-api/client.ts`. No logic is duplicated.

**Why.** Server Actions are plain async functions, so they can be tested directly with Jest. The route handlers already hold tested logic for the secret-key operations; wrapping them is cheaper and safer than copying it.

**Alternatives.** Do all writes from the browser with the Supabase browser client: rejected because it puts validation and error handling in untestable client code. Wrap every write in a new route handler: rejected as pure duplication.

## R4. Tabs, confirmations and the phone menu without client state

**Decision.** The tabs in the wireframes are URL query values (`?tab=answers`), shown as links. Confirmation steps for destructive actions (delete household, archive dish, send now, revoke access) are a server-rendered second step (`?confirm=delete`) with its own form, and for deleting a household the person must type its name. The phone menu is a `<details>` element.

**Why.** No client state to test, back and forward work, links can be shared between Chris and Hannah, and everything works before JavaScript loads. The wireframes' tabs were a stand-in for this.

**Alternatives.** Client-side tabs and modals: more code and more client components for no gain in a test console.

## R5. Styling: one plain stylesheet, tokens first, responsive

**Decision.** Port the wireframes' `admin.css` and `mobile.css` into one responsive stylesheet, `src/app/(admin)/admin.css`. The values (colors, type, spacing, radius) are CSS variables at the top. Components use semantic class names (`.card`, `.badge`, `.btn`), not Tailwind utility classes. Under about 900 px wide the sidebar becomes a top bar with a menu, and tables become stacked rows (each cell labelled with a `data-label`), so there is one set of markup for both sizes.

**Why.** Requirement FR-029 and success criterion SC-008 call for presentation that can be replaced without touching behavior. With semantic classes and one stylesheet, the creative director's v1 can replace the stylesheet (or just the variables). Jest automatically mocks stylesheet imports, so behavior tests cannot depend on styling by construction.

**Departure from the stack list.** The constitution lists Tailwind CSS. This is recorded in Complexity Tracking in the plan and in a decision record (see R13). Tailwind stays installed for the designer's site.

**Source.** [Next.js docs: Jest, "next/jest ... Auto mocking stylesheets"](https://nextjs.org/docs/app/guides/testing/jest).

## R6. Excel import: server-side conversion with `read-excel-file`

**Decision.** Accept `.xlsx` as well as CSV at the existing `POST /api/admin/guests/import`. The server reads the first sheet with `read-excel-file` (Node entry point), turns it into the same text the CSV parser already takes, and runs the unchanged validation, so both formats give identical results. The response also says which sheet was read. Details are in [contracts/import-excel.md](./contracts/import-excel.md).

**Library facts** (npm registry and project README, checked 2026-10-25):

| Library           | Version and date                                              | Notes                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-excel-file` | 9.3.12, last modified 2026-10-07, MIT, about 2.7 MB unpacked  | Reads `.xlsx`; Node entry accepts a file path, stream, Buffer or Blob; `readSheet` returns rows as arrays of string, number, boolean or Date and reads the first sheet by default; legacy `.xls` throws an error.                                                |
| `exceljs`         | 4.4.0, last published 2024-12-20, MIT, about 21.8 MB unpacked | Much larger and aimed at writing as well as reading; no release in the last ten months.                                                                                                                                                                          |
| `xlsx` (SheetJS)  | npm still serves 0.18.5                                       | Snyk and SheetJS's own issue tracker report prototype pollution (fixed in 0.19.3) and a denial-of-service regular expression (fixed in 0.20.2) that affect files read by the library. The fixed releases are not published to npm, only from SheetJS's own site. |

**Why `read-excel-file`.** It is small, current, MIT-licensed, reads only (all we need), and avoids a library whose npm release has known file-parsing flaws. Constitution principle V asks us to use current tooling and record the choice.

**Open points to confirm in the first test, not assumed:**

1. Whether row numbers it returns match Excel's row numbers when the sheet starts with blank rows. The error messages tell staff "row 14", so this must match what they see in Excel.
2. How to list every sheet name for the "which sheet was read" message. The README says the default export returns all sheets as `{ sheet, data }`, and that a separate sheet-names function was removed in version 8.
3. The README says nothing about decompression limits, so the route keeps its 2 MiB upload cap and adds a row cap of 5,000.

**Request size.** Vercel documents a 4.5 MB request body limit for functions, so the existing 2 MiB cap sits safely under it. Source: [Vercel Functions limits](https://vercel.com/docs/functions/limitations).

**Alternatives.** Parse in the browser and send the CSV text: rejected, because it ships a large library to the browser and moves untrusted-file parsing client-side where it cannot be tested with the server tests. Ask staff to save as CSV: rejected by the couple's review comment (CSV or Excel).

**Sources.** [read-excel-file README](https://github.com/catamphetamine/read-excel-file); npm registry metadata for all three packages; [Snyk: xlsx vulnerabilities](https://security.snyk.io/package/npm/xlsx/0.16.2); [SheetJS issue 3012](https://git.sheetjs.com/sheetjs/sheetjs/issues/3012). (I could not open the npm package pages themselves, which returned an access error, so version facts come from the registry command line.)

## R7. Time zone: Pacific, one setting, no new library

**Decision.** Every date and time is shown and entered in Pacific time (`America/Los_Angeles`), held in one constant read from `NEXT_PUBLIC_ADMIN_TIME_ZONE` (default `America/Los_Angeles`). Display uses the built-in `Intl.DateTimeFormat` with that zone. Entry uses `<input type="datetime-local">`, which has no zone, and a small helper converts the typed value from Pacific to the exact moment the database stores. The zone is named next to every time (for example "4:00 PM PT").

**Why.** The couple confirmed the wedding is in California (so Pacific), and the staff may be in another zone. Using the platform's `Intl` avoids a dependency. The helper is the one piece of real logic, so it gets tests that cross the spring and fall clock changes, and the two ambiguous or missing hours.

**Alternatives.** A date library: rejected, no need for one small helper. Per-event zones: rejected, the spec says one value everywhere.

## R8. Showing who answered (the couple's review comment)

**Decision.** Show "Recorded by staff, name, time" or "Guest, time" wherever an RSVP or meal choice appears, using these rules:

1. **RSVP, current answer:** take the latest `rsvp_history` row for that guest and event whose new status equals the current status. It stores `actor_kind` (`couple`, `planner`, `guest`, `system`) and `changed_by` permanently. If the staff member's account is later removed, the row still says staff.
2. **RSVP history page:** show `actor_kind` straight from the row.
3. **Staff name:** look up `changed_by` in `staff` (readable by staff). If the person is no longer in `staff`, show "Staff (former member)".
4. **Meal choices, current choice:** take the newest `meal_selection_history` row for that guest and course whose `new_dish_id` is the current dish (the database writes a history row for a first choice and for every change). Its new `actor_kind` column (see below) gives the source; `changed_by` gives the staff name.
5. **Meal history page:** show `actor_kind` straight from the row, as for RSVPs.
6. **Rows written before the migration** have an empty `actor_kind`. For those only, compare `changed_by` with the household's sign-in account (guest) and the `staff` table (staff). If it matches neither, show "Unknown" rather than guessing. If the same account is both (a staff member who is also a household responder), show "Staff or household (same account)".

**Decision: add a small migration (gap G2 closed).** `meal_selection_history` stored `changed_by` but no kind, unlike `rsvp_history`. The migration adds `actor_kind text` to it, nullable, with the same four allowed values (`couple`, `planner`, `guest`, `system`) and the same default helper RSVP history uses (`public.current_actor_kind()`). Existing writes name their columns explicitly, so none of the seven functions that write meal history changes.

- **The default is set after the column is added**, not in the same statement. Adding a column with a changing default would fill every existing row with the migration's own value (`system`, because nobody is signed in during a migration), which would label old rows wrongly. Adding it empty and then setting the default leaves old rows empty and fills new ones.
- **The stored type describes the account, not the screen.** A planner who answers through the guest screen is stored as `planner`, exactly as RSVP history already behaves.
- **The couple confirmed they want this** (2026-10-25).
- **How it reaches the hosted database:** by merging to `main`, which applies new migration files (AGENTS.md, "How migrations reach the hosted database"). It is never pushed by hand.

**Why.** Success criterion SC-010 needs the source to be right on every row. Rule 1 achieves that for RSVPs with data that already exists, and rules 4 to 6 do the same for meals once the migration is in.

## R9. Search, filters and paging

**Decision.** Load households and guests through the existing staff functions (`staff_households()`, `staff_guests()`), join them in the server function, then filter and page in memory (25 per page). No new database function.

**Why.** The functions return every row at once and the household list is a few hundred rows at most (the earlier plan sized it at about 50 households, and the spec's import target is 200). Guest names are not on the household row, so searching by guest name needs the join anyway. An index or a search function would be effort with no benefit at this size.

**Alternatives.** A new search RPC: rejected, FR-030 says to avoid new data-layer work. Revisit if the list ever passes a few thousand rows.

## R10. Testing approach

**Decision.**

- **Pages are thin.** An async page loads data through a `src/lib/admin` function and passes plain props to synchronous presentational components in `src/components/admin/`.
- **Tested with Jest and React Testing Library:** the presentational components (queried by role and label, never by class), the data functions and attribution rules with fake Supabase clients, the server actions (session check, validation, success and error paths), the time helper, and the spreadsheet conversion.
- **Not covered by Jest:** the async pages themselves.
- **No end-to-end framework in v0.** Next.js says Jest does not support async Server Components and recommends end-to-end tests for them. A browser test framework would need the local database running in CI, which only the database job has. Instead, the quickstart is a written walkthrough against local Supabase, and a script in the style of the existing `scripts/guest-api-smoke.ts` can check the API calls the console makes. Adding an end-to-end suite later is listed as a follow-up.

**Source.** [Next.js docs: Jest, "Good to know"](https://nextjs.org/docs/app/guides/testing/jest).

## R11. The failure page the sign-in link needs

**Finding.** `src/app/auth/callback/route.ts` redirects any unusable sign-in link to `/auth/error`, and its comment says someone else will serve that path. Nothing does, so staff (and guests) would see a 404.

**Decision.** Add a minimal neutral `/auth/error` page inside the admin route group, telling the person the link did not work and pointing staff to `/admin/sign-in`. It is shared with the guest flow, so the designer can replace it later.

## R12. Dependencies added

Exactly one: `read-excel-file` (R6). No UI, form, table or date library. `server-only` is used the way `src/lib/supabase/admin.ts` already uses it.

## R13. Decision records to write

Constitution principle V requires recorded decisions. The tasks create two files in `docs/decisions/`:

- **0009: Admin console v0 scope and approach.** Supersedes the "no screens" rule for admin screens only, and records the route group, the plain stylesheet, and the thin-page testing approach.
- **0010: Excel library for the guest import.** Records the table in R6 and the open points.
