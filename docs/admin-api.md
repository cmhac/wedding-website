# Admin API

> **A minimal v0 admin console exists.** It is temporary, and it uses these same interfaces (direct data access under row-level security plus the route handlers below); it adds no other back door. Guest-facing screens, including the RSVP, and the public site are still not provided here; the designer builds those against [guest-api.md](./guest-api.md). The couple can also use the command-line scripts (`scripts/import-guests.ts`, `scripts/create-staff-user.ts`) and the database dashboard.

This document is published from `specs/001-guest-data-model/contracts/admin-api.md`. A contract test (`src/lib/admin-api/__tests__/contract.test.ts`) fails if the route table below stops matching the route handlers under `src/app/api/admin/`.

## Assumptions to confirm

- The admin frontend is built outside this repository, is served from the **same origin** as this Next.js app, and serves `/admin`, where staff land after signing in.
- Staff are the couple and the planner. They have identical access, except that only the couple can use the staff-access endpoints.

All route handlers return JSON (exports return CSV) and use the error shape from [guest-api.md](./guest-api.md): `{ "error": { "code", "message", "issues?" } }`. Every endpoint requires a signed-in staff session (`401` without a session, `403` for a guest), except where noted. Staff are the couple and the planner, who have identical access, except that only the couple can use the staff-access endpoints.

## 1. Direct data access under row-level security (staff only)

Staff sign in, then use the Supabase client with their session. Row-level security gives staff full access; guests and anonymous callers get nothing. This covers everything that needs no server secret, so there are no wrapper endpoints for it.

| Capability                                                        | Mechanism                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read households, guests, invitations, RSVPs                       | `select` on the tables for the columns guests can also read; RPCs `staff_households()`, `staff_guests()`, `staff_invitations()` for every column (see below) |
| Create, edit, delete guests and invitations                       | `insert`/`update`/`delete` on `guests`, `invitations`                                                                                                        |
| Edit household fields other than the sign-in email                | `update` on `households` (not `contact_email` or `auth_user_id`; see below)                                                                                  |
| Invite guests to an event later                                   | RPC `invite(guest_ids, event_id)`                                                                                                                            |
| Answer an RSVP or meal on a household's behalf                    | RPCs `staff_set_rsvp`, `staff_set_meal`                                                                                                                      |
| Events, menus, courses, dishes, dish tags, dietary categories     | `insert`/`update`/`delete` on those tables; RPC `archive_dish(dish_id)` to retire a dish                                                                     |
| Settings (default deadline, RSVPs open)                           | `update` on `settings`                                                                                                                                       |
| Possible duplicate households                                     | RPC `find_duplicate_households()`                                                                                                                            |
| Create, edit, cancel a campaign                                   | `insert`/`update` on `campaigns` (a database check rejects an invalid audience)                                                                              |
| Preview who a campaign reaches, and who needs a paper invite      | RPC `resolve_audience(filter)`                                                                                                                               |
| Delivery status per household                                     | `select` on `messages`                                                                                                                                       |
| Reporting: counts, meal totals, dietary list, conflicts, progress | `select` on views `event_counts`, `dish_totals`, `dietary_list`, `meal_conflicts`, `household_rsvp_progress`                                                 |
| Who changed what                                                  | `select` on `audit_log`, `rsvp_history`, `meal_selection_history`                                                                                            |
| List staff                                                        | `select` on `staff`                                                                                                                                          |

Columns and RPC shapes are in `specs/001-guest-data-model/data-model.md` and `specs/001-guest-data-model/contracts/database-rpc.md`. `households.contact_email` and `households.auth_user_id` cannot be written directly (and staff cannot insert or delete households directly), because the sign-in account must change with them; use the route handlers in section 2.

**Staff-only columns.** Guests share the `authenticated` database role with staff, so the columns meant for staff are not readable with a plain `select` on the table by anyone: `households.notes`, `delivery_problem`, `rsvp_deadline_override` and `address`; `guests.notes`; `invitations.invited_by` and `responded_by`. A `select *` on `households`, `guests` or `invitations` is refused with a permission error; name the columns, or read full rows with `supabase.rpc("staff_households")` (and `staff_guests`, `staff_invitations`), which return every column for staff and are refused for everyone else. The RPCs accept filters, for example `supabase.rpc("staff_households").eq("id", id).single()`. Writing these columns is unchanged: `update` on the table works for staff (ask for no representation back, or select only readable columns, because the written row cannot be read back from the table). A household can be linked to a staff member's own sign-in account only by the couple.

## 2. Route handlers (operations that need a server secret)

| Method and path                       | Purpose                                                                                   | Success | Errors                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ------- | -------------------------------------- |
| `POST /api/admin/sign-in`             | Email a staff sign-in link (no session needed; neutral message like the guest endpoint)   | 202     | 422, 429                               |
| `POST /api/admin/sign-out`            | End the session                                                                           | 204     | none                                   |
| `POST /api/admin/households`          | Create a household with its guests and its sign-in account                                | 201     | 401, 403, 409 `email_in_use`, 422      |
| `PATCH /api/admin/households/[id]`    | Change the contact email (updates or unlinks the sign-in account); other fields as needed | 200     | 401, 403, 404, 409 `email_in_use`, 422 |
| `DELETE /api/admin/households/[id]`   | Delete the household, its guests, and its sign-in account                                 | 204     | 401, 403, 404                          |
| `POST /api/admin/guests/import`       | CSV import with per-row errors                                                            | 200     | 401, 403, 422                          |
| `POST /api/admin/campaigns/[id]/send` | Send a draft or scheduled campaign now                                                    | 200     | 401, 403, 404, 409                     |
| `GET /api/admin/exports/[kind]`       | CSV: `guests`, `responses`, `caterer`                                                     | 200     | 401, 403, 404                          |
| `POST /api/admin/staff`               | Grant planner access (couple only)                                                        | 201     | 401, 403, 409, 422                     |
| `DELETE /api/admin/staff/[userId]`    | Revoke access (couple only; the last couple member cannot be removed)                     | 204     | 401, 403, 404, 409 `last_couple`       |
| `GET /auth/callback`                  | Completes sign-in from the emailed link; staff are redirected to `/admin`                 | 302     | 302 to a failure path                  |

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
import { createHousehold, importGuests } from "@/lib/admin-api/client";

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
}
```

Direct data access (section 1) uses the Supabase client, for example `supabase.rpc("staff_households")` or `supabase.rpc("invite", { guest_ids, event_id })`, under the staff session.

## Rules

- No endpoint trusts a staff claim from the client; staff status comes from the session and the `staff` table on every request, so revocation takes effect on the next request.
- Changes made through these endpoints and through direct data access are attributed to the signed-in staff member in the audit log.
- Nothing here renders HTML or any content for people to read. Presentation is the admin frontend's concern, and email content is supplied separately through the template registry.
