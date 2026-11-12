# Admin API

> **A minimal v0 admin console exists.** It is temporary, and it uses these same interfaces (direct data access under row-level security plus the route handlers below); it adds no other back door. Guest-facing screens, including the RSVP, and the public site are still not provided here; the designer builds those against [guest-api.md](./guest-api.md). The couple can also use the command-line scripts (`scripts/import-guests.ts`, `scripts/create-staff-user.ts`) and the database dashboard.

This document is published from `specs/001-guest-data-model/contracts/admin-api.md`. A contract test (`src/lib/admin-api/__tests__/contract.test.ts`) fails if the route table below stops matching the route handlers under `src/app/api/admin/`.

## Assumptions to confirm

- The admin frontend is built outside this repository, is served from the **same origin** as this Next.js app, and serves `/admin`, where staff land after signing in.
- Staff are the couple and the planner. They have identical access, except that only the couple can use the staff-access endpoints.

All route handlers return JSON (exports return CSV) and use the error shape from [guest-api.md](./guest-api.md): `{ "error": { "code", "message", "issues?" } }`. Every endpoint requires a signed-in staff session (`401` without a session, `403` for a guest), except where noted. Staff are the couple and the planner, who have identical access, except that only the couple can use the staff-access endpoints.

## 1. Direct data access under row-level security (staff only)

Staff sign in, then use the Supabase client with their session. Row-level security gives staff full access; guests and anonymous callers get nothing. This covers everything that needs no server secret, so there are no wrapper endpoints for it.

| Capability                                                        | Mechanism                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read households, guests, invitations, RSVPs                       | `select` on the tables for the columns guests can also read; RPCs `staff_households()`, `staff_guests()`, `staff_invitations()` for every column (see below)                                                  |
| Create, edit, delete guests and invitations                       | `insert`/`update`/`delete` on `guests`, `invitations`                                                                                                                                                         |
| Edit household fields                                             | `update` on `households` (not `auth_user_id`; see below)                                                                                                                                                      |
| Read, add, change and remove a household's email addresses        | `select`, `insert`, `update`, `delete` on `household_contacts` (triggers enforce uniqueness and the staff-address rule); RPCs `add_household_contact`, `update_household_contact`, `remove_household_contact` |
| Choose the wedding event, set the sign-in limits                  | `update` on `settings` (`wedding_event_id`, `sign_in_limit_per_address`, `sign_in_window_minutes`, `sign_in_limit_global_per_hour`)                                                                           |
| Issue a household a new personal link                             | RPC `reissue_invite_link(household_id)`; the route below also returns the link                                                                                                                                |
| Invite guests to an event later                                   | RPC `invite(guest_ids, event_id)`                                                                                                                                                                             |
| Answer an RSVP or meal on a household's behalf                    | RPCs `staff_set_rsvp`, `staff_set_meal`                                                                                                                                                                       |
| Events, menus, courses, dishes, dish tags, dietary categories     | `insert`/`update`/`delete` on those tables; RPC `archive_dish(dish_id)` to retire a dish                                                                                                                      |
| Settings (default deadline, RSVPs open)                           | `update` on `settings`                                                                                                                                                                                        |
| Possible duplicate households                                     | RPC `find_duplicate_households()`                                                                                                                                                                             |
| Create, edit, cancel a campaign                                   | `insert`/`update` on `campaigns` (a database check rejects an invalid audience)                                                                                                                               |
| Preview who a campaign reaches, and who needs a paper invite      | RPC `resolve_audience(filter)`                                                                                                                                                                                |
| Delivery status per household                                     | `select` on `messages`                                                                                                                                                                                        |
| Reporting: counts, meal totals, dietary list, conflicts, progress | `select` on views `event_counts`, `dish_totals`, `dietary_list`, `meal_conflicts`, `household_rsvp_progress`                                                                                                  |
| Who changed what                                                  | `select` on `audit_log`, `rsvp_history`, `meal_selection_history`                                                                                                                                             |
| List staff                                                        | `select` on `staff`                                                                                                                                                                                           |

Columns and RPC shapes are in `specs/001-guest-data-model/data-model.md` and `specs/001-guest-data-model/contracts/database-rpc.md`. `households.auth_user_id` cannot be written directly (and staff cannot insert or delete households directly), because the household's sign-in account must change with it; use the route handlers in section 2. A household's email addresses live in `household_contacts` (one row per address, unique across households, never a staff member's address); changing one never touches the sign-in account, which has a synthetic address that is never mailed.

**Staff-only columns.** Guests share the `authenticated` database role with staff, so the columns meant for staff are not readable with a plain `select` on the table by anyone: `households.notes`, `delivery_problem`, `rsvp_deadline_override` and `address`; `guests.notes`; `invitations.invited_by` and `responded_by`. A `select *` on `households`, `guests` or `invitations` is refused with a permission error; name the columns, or read full rows with `supabase.rpc("staff_households")` (and `staff_guests`, `staff_invitations`), which return every column for staff and are refused for everyone else. The RPCs accept filters, for example `supabase.rpc("staff_households").eq("id", id).single()`. Writing these columns is unchanged: `update` on the table works for staff (ask for no representation back, or select only readable columns, because the written row cannot be read back from the table). A household can be linked to a staff member's own sign-in account only by the couple.

## 2. Route handlers (operations that need a server secret)

| Method and path                                        | Purpose                                                                                                                                                                                                                            | Success | Errors                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `POST /api/admin/sign-in`                              | Email a staff sign-in link (no session needed; neutral message like the guest endpoint)                                                                                                                                            | 202     | 422, 429                                                                                             |
| `POST /api/admin/sign-out`                             | End the session                                                                                                                                                                                                                    | 204     | none                                                                                                 |
| `POST /api/admin/households`                           | Create a household with its guests and its sign-in account; body takes `contacts: [{ kind: "email", value }]`                                                                                                                      | 201     | 401, 403, 409 `email_in_use` or `staff_account`, 422                                                 |
| `PATCH /api/admin/households/[id]`                     | Change household fields (addresses have their own routes)                                                                                                                                                                          | 200     | 401, 403, 404, 422                                                                                   |
| `DELETE /api/admin/households/[id]`                    | Delete the household, its guests, its addresses, and its sign-in account                                                                                                                                                           | 204     | 401, 403, 404                                                                                        |
| `POST /api/admin/households/[id]/contacts`             | Add an address                                                                                                                                                                                                                     | 201     | 401, 403, 404, 409 `email_in_use` or `staff_account`, 422                                            |
| `PATCH /api/admin/households/[id]/contacts/[cid]`      | Change an address (clears its delivery flag)                                                                                                                                                                                       | 200     | 401, 403, 404, 409, 422                                                                              |
| `DELETE /api/admin/households/[id]/contacts/[cid]`     | Remove an address; `paper_only: true` when it was the last                                                                                                                                                                         | 200     | 401, 403, 404                                                                                        |
| `POST /api/admin/households/[id]/phones`               | Add a United States phone number (the opt-in starts "not asked"; the guest ticks it, or staff mark it as consented); only while texting is configured                                                                              | 201     | 401, 403, 404, 409 `phone_in_use` or `texting_not_configured`, 422 `invalid_phone` or `not_us_phone` |
| `PATCH /api/admin/households/[id]/phones/[cid]`        | Change a number (its opt-in goes back to "not asked")                                                                                                                                                                              | 200     | 401, 403, 404, 409, 422                                                                              |
| `DELETE /api/admin/households/[id]/phones/[cid]`       | Remove a number and its opt-in; `paper_only: true` when it was the last contact                                                                                                                                                    | 200     | 401, 403, 404                                                                                        |
| `POST /api/admin/households/[id]/phones/[cid]/consent` | Mark or clear one number's text consent (body `{ "mode": "mark" or "clear", "override_declined": bool, "note": string }`); returns the counts; sends no text                                                                       | 200     | 401, 403, 404, 409 `declined_needs_override`, 422                                                    |
| `POST /api/admin/households/consent`                   | Mark or clear text consent for every phone number of the chosen households, all or nothing (body `{ "household_ids": [...], "mode", "override_declined", "note", "dry_run" }`); a dry run only counts                              | 200     | 401, 403, 404, 422                                                                                   |
| `GET /api/admin/households/[id]/invite-link`           | The household's current personal link, to copy: `{ url, issued_at }`, never cached                                                                                                                                                 | 200     | 401, 403, 404                                                                                        |
| `POST /api/admin/households/[id]/invite-link`          | Issue a new link; the old one stops working at once; returns the new link                                                                                                                                                          | 200     | 401, 403, 404                                                                                        |
| `POST /api/admin/households/[id]/sign-out`             | Sign the household out on every device                                                                                                                                                                                             | 204     | 401, 403, 404                                                                                        |
| `POST /api/admin/guests/import`                        | CSV or Excel (.xlsx) import with per-row errors; `contact_email`, `contact_email_2`, `contact_email_3`, ... columns give a household several addresses                                                                             | 200     | 401, 403, 422                                                                                        |
| `POST /api/admin/campaigns/[id]/send`                  | Send a draft or scheduled campaign now                                                                                                                                                                                             | 200     | 401, 403, 404, 409                                                                                   |
| `POST /api/admin/campaigns/test`                       | A rehearsal of a message to one household (body `{ "message_type_key", "channel", "household_id" }`), through the real send path; creates a campaign marked as a test that never counts as the real send; returns the send summary | 200     | 401, 403, 404, 409 `template_missing`, 422                                                           |
| `GET /api/admin/exports/[kind]`                        | CSV: `guests`, `responses`, `caterer`                                                                                                                                                                                              | 200     | 401, 403, 404                                                                                        |
| `POST /api/admin/staff`                                | Grant planner access (couple only); refuses an address that is a household contact                                                                                                                                                 | 201     | 401, 403, 409 (also `household_contact`), 422                                                        |
| `DELETE /api/admin/staff/[userId]`                     | Revoke access (couple only; the last couple member cannot be removed)                                                                                                                                                              | 204     | 401, 403, 404, 409 `last_couple`                                                                     |
| `GET /auth/callback`                                   | Completes sign-in from the emailed link; staff are redirected to `/admin`                                                                                                                                                          | 302     | 302 to a failure path                                                                                |

Request and response shapes for the route handlers are the zod schemas exported from `src/lib/admin-api/schemas.ts`, with typed fetch wrappers in `src/lib/admin-api/client.ts`. The import, exports, and send behavior are specified in `specs/001-guest-data-model/contracts/http-endpoints.md`.

## Sign-in and session

`POST /api/admin/sign-in` with `{ "email": "..." }` always answers `202` with a neutral message, whether or not the address belongs to a staff account. The emailed link opens `GET /auth/callback` (staff links carry `?audience=staff`, which only selects the staff variant of the email), which sets HTTP-only session cookies and redirects staff to `/admin` (anything unusable goes to `/auth/error`). Staff accounts are never created by sign-in; they exist only because `scripts/create-staff-user.ts` (or the couple's staff-access endpoint) created them. Call the endpoints with `credentials: "same-origin"`; direct data access uses the Supabase client with the same signed-in session.

## Error codes

Errors use `{ "error": { "code", "message", "issues?" } }`. Codes the route handlers return:

| Status | `code`                                                          | Meaning                                                                                          |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 401    | `unauthenticated`                                               | No signed-in session                                                                             |
| 403    | `forbidden`                                                     | A guest session, or a planner on a couple-only endpoint                                          |
| 404    | `not_found`                                                     | The household, campaign, staff member, or export kind does not exist                             |
| 409    | `email_in_use`                                                  | The contact email belongs to another household                                                   |
| 409    | `staff_account`                                                 | The household is linked to a staff member's sign-in account, so its email cannot be changed here |
| 409    | `last_couple`                                                   | The last couple member cannot be removed                                                         |
| 409    | `campaign_not_sendable`, `template_missing`, `invalid_audience` | The campaign cannot be sent now (wrong state, no registered template, or an invalid audience)    |
| 422    | `invalid_request`, `invalid_payload`, `invalid_file`            | The body or CSV failed validation; `issues` lists problems                                       |
| 429    | `rate_limited`                                                  | Too many sign-in requests                                                                        |
| 500    | `server_error`                                                  | Something unexpected; no internal text is returned                                               |

## Example calls

Typed wrappers in `src/lib/admin-api/client.ts` resolve to `{ ok: true, data }` or `{ ok: false, status, error }` and never throw. Shapes are the zod schemas in `src/lib/admin-api/schemas.ts`, `campaign-schemas.ts`, and `staff-schemas.ts`.

```ts
import {
  createHousehold,
  importGuests,
  importGuestsFile,
} from "@/lib/admin-api/client";

const created = await createHousehold({
  display_name: "The Examples",
  contact_email: "household@example.com",
  plus_one_allowance: 0,
  guests: [{ first_name: "Sam", last_name: "Example" }],
});
if (!created.ok && created.error.code === "email_in_use") {
  // show created.error.message
}

const result = await importGuests(csvText);
if (result.ok) {
  // result.data.created and result.data.errors (row, field, message)
  // result.data.source is { format: "csv" } here
}

// An Excel file chosen in a file input (the first sheet is read):
const fromExcel = await importGuestsFile(fileInput.files[0]);
if (fromExcel.ok && fromExcel.data.source.format === "xlsx") {
  // source.sheet is { name, index: 1, count }, for "the first of 2 sheets"
}
```

### Importing from Excel

`POST /api/admin/guests/import` takes either the CSV text (`Content-Type: text/csv`, or any type not listed here, as before) or the raw bytes of an `.xlsx` file (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). Excel files are read from the first sheet, with the same columns as the CSV, and then go through the same validation. Limits: 2 MiB upload and 5,000 rows.

- Every response now has `source`: `{ "format": "csv" }`, or `{ "format": "xlsx", "sheet": { "name", "index": 1, "count" } }` where `count` is the number of sheets in the file.
- Error `row` numbers are the sheet's own row numbers (the header is the first non-blank row; blank rows above it are counted).
- Whole-file failures are `422 invalid_file` with one of: "This file could not be read. Upload a .csv or .xlsx file." (corrupt, an older `.xls`, or password-protected), "The file is empty." (no rows, or an empty first sheet), "The file has too many rows.", or "The file is too large.". Messages never repeat cell values.

Direct data access (section 1) uses the Supabase client, for example `supabase.rpc("staff_households")` or `supabase.rpc("invite", { guest_ids, event_id })`, under the staff session.

## Rules

- No endpoint trusts a staff claim from the client; staff status comes from the session and the `staff` table on every request, so revocation takes effect on the next request.
- Changes made through these endpoints and through direct data access are attributed to the signed-in staff member in the audit log.
- Nothing here renders HTML or any content for people to read. Presentation is the admin frontend's concern, and email content is supplied separately through the template registry.

## Text messages (optional, off until the couple set it up)

"Configured" means the Twilio settings are on the server; "available" means configured and the couple's switch (`settings.sms_enabled`) is on. Without the settings the console shows a warning banner on every page and no text content anywhere else.

- **Phone numbers.** `POST /api/admin/households/[id]/phones`, `PATCH` and `DELETE .../phones/[cid]` (body `{ "value": "<number as typed>" }`). The number is validated as a United States number and stored as E.164. Errors: `422 invalid_phone`, `422 not_us_phone`, `409 phone_in_use`, `409 texting_not_configured`, `404`, `401`, `403`. Adding or changing a number sets its opt-in to "not asked". Direct writes to `household_contacts` are limited to email; phone rows can be read (including `sms_consent`, `sms_consent_at`, `sms_consent_source`) but staff cannot write the opt-in columns directly. An opt-in is recorded by the guest's own ticked box, or, since the save the date outreach, by the couple or the planner through `POST .../phones/[cid]/consent` and `POST /api/admin/households/consent` (the database function `staff_set_sms_consent`: staff only, all or nothing, recording who, when, the source `staff` and an optional note), or by the import. A number that declined needs `override_declined`. Marking sends no text.
- **Import.** New columns `contact_phone`, `contact_phone_2`, ... with per-row, per-column errors ("Not a valid phone number", "Only United States numbers are supported", "Repeats another number of this household", "Used by another household in this file", "Already used by another household"). An optional consent column follows each phone column (`contact_phone_consent`, `contact_phone_2_consent`, ...): `yes` records the number as consented "by import" (only from "not asked", or from "declined" when the import's override option is ticked), `no` or blank leaves it alone, anything else is a per-row, per-column error `invalid_consent`. While not configured the phone cells are ignored, nothing from them is saved, and the response carries `phones_ignored`; otherwise `phones_saved`.
- **Campaigns.** `campaigns.channel` is `email` (default), `text` or `both`, saved only while configured and locked after sending. Text goes only to opted-in numbers; the save the date and the invitation each have text wording, and a text campaign for a type with none is refused (`template_missing`) before anything is queued. Texts are paced at one every 2 seconds, up to 45 seconds a run; the scheduled run continues the rest (a campaign stays `sending` until nothing is queued). Skipped numbers carry a reason: `not_opted_in`, `declined`, `texting_unavailable`, `no_phone`, `invalid_number`.
- **Delivery.** `POST /api/webhooks/twilio` (Twilio's status callback, signature-checked) updates each text; a failed text flags the number and household. A text claimed but never confirmed for 15 minutes becomes `failed` with `unknown_outcome` and is never re-sent automatically.
- **Switch.** Settings, "Text messaging" (couple only, shown only when configured). Turning it on texts nobody by itself.
