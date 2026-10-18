# Contract: Admin API

The interface for whoever builds the admin screens. **This repository builds no admin UI and no other visual components**; the couple, the planner, and any admin frontend use the interface below. It is published as `docs/admin-api.md` and enforced by a contract test (the endpoint table must match the route handlers on disk).

Assumptions to confirm: the admin frontend is built outside this feature (likely by the designer), is served from the same origin as this Next.js app, and serves `/admin`, where staff land after signing in. Until it exists, the couple can operate through the command-line scripts (`scripts/import-guests.ts`, `scripts/create-staff-user.ts`) and the database dashboard.

All route handlers return JSON (exports return CSV) and use the error shape from [guest-api.md](./guest-api.md): `{ "error": { "code", "message", "issues?" } }`. Every endpoint requires a signed-in staff session (`401` without a session, `403` for a guest), except where noted. Staff are the couple and the planner, who have identical access, except that only the couple can use the staff-access endpoints.

## 1. Direct data access under row-level security

Staff sign in, then use the Supabase client with their session. Row-level security gives staff full access; guests and anonymous callers get nothing. This covers everything that needs no server secret, so there are no wrapper endpoints for it.

| Capability                                                        | Mechanism                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Read households, guests, invitations, RSVPs                       | `select` on the tables                                                                                       |
| Create, edit, delete guests and invitations                       | `insert`/`update`/`delete` on `guests`, `invitations`                                                        |
| Edit household fields other than the sign-in email                | `update` on `households` (not `contact_email` or `auth_user_id`; see below)                                  |
| Invite guests to an event later                                   | RPC `invite(guest_ids, event_id)`                                                                            |
| Answer an RSVP or meal on a household's behalf                    | RPCs `staff_set_rsvp`, `staff_set_meal`                                                                      |
| Events, menus, courses, dishes, dish tags, dietary categories     | `insert`/`update`/`delete` on those tables; RPC `archive_dish(dish_id)` to retire a dish                     |
| Settings (default deadline, RSVPs open)                           | `update` on `settings`                                                                                       |
| Possible duplicate households                                     | RPC `find_duplicate_households()`                                                                            |
| Create, edit, cancel a campaign                                   | `insert`/`update` on `campaigns` (a database check rejects an invalid audience)                              |
| Preview who a campaign reaches, and who needs a paper invite      | RPC `resolve_audience(filter)`                                                                               |
| Delivery status per household                                     | `select` on `messages`                                                                                       |
| Reporting: counts, meal totals, dietary list, conflicts, progress | `select` on views `event_counts`, `dish_totals`, `dietary_list`, `meal_conflicts`, `household_rsvp_progress` |
| Who changed what                                                  | `select` on `audit_log`, `rsvp_history`, `meal_selection_history`                                            |
| List staff                                                        | `select` on `staff`                                                                                          |

Columns and RPC shapes are in [data-model.md](../data-model.md) and [database-rpc.md](./database-rpc.md). `households.contact_email` and `households.auth_user_id` cannot be written directly (and staff cannot insert or delete households directly), because the sign-in account must change with them; use the route handlers in section 2.

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

Request and response shapes for the route handlers are the zod schemas exported from `src/lib/admin-api/schemas.ts`, with typed fetch wrappers in `src/lib/admin-api/client.ts`. The import, exports, and send behavior are specified in [http-endpoints.md](./http-endpoints.md).

## Rules

- No endpoint trusts a staff claim from the client; staff status comes from the session and the `staff` table on every request, so revocation takes effect on the next request (FR-041).
- Changes made through these endpoints and through direct data access are attributed to the signed-in staff member in `audit_log` (FR-042).
- Nothing here renders HTML for people to read, except the plain email templates. Presentation is entirely the admin frontend's concern.
