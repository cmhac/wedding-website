# Contract changes: Admin API and admin console

Changes to [`specs/001-guest-data-model/contracts/admin-api.md`](../../001-guest-data-model/contracts/admin-api.md), [`http-endpoints.md`](../../001-guest-data-model/contracts/http-endpoints.md) and the admin console routes in [`specs/002-admin-console-v0/contracts/admin-routes.md`](../../002-admin-console-v0/contracts/admin-routes.md). When implemented, those files and `docs/admin-api.md` are updated to match. Both the couple and the planner may use everything here.

## Route handlers

| Method and path                                    | Purpose                                                                                                                   | Success | Errors                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| `POST /api/admin/households` (changed)             | Body takes `contacts: [{ kind: "email", value }]` instead of `contact_email`; the household's Auth user is always created | 201     | 401, 403, 409 `email_in_use` or `staff_account`, 422      |
| `PATCH /api/admin/households/[id]` (changed)       | No longer changes addresses; other fields as before                                                                       | 200     | 401, 403, 404, 422                                        |
| `POST /api/admin/households/[id]/contacts`         | Add an address                                                                                                            | 201     | 401, 403, 404, 409 `email_in_use` or `staff_account`, 422 |
| `PATCH /api/admin/households/[id]/contacts/[cid]`  | Change an address (clears its delivery flag)                                                                              | 200     | 401, 403, 404, 409, 422                                   |
| `DELETE /api/admin/households/[id]/contacts/[cid]` | Remove an address; response says `paper_only: true` if it was the last                                                    | 200     | 401, 403, 404                                             |
| `GET /api/admin/households/[id]/invite-link`       | Return the household's current personal link (to copy)                                                                    | 200     | 401, 403, 404                                             |
| `POST /api/admin/households/[id]/invite-link`      | Reissue: the old link stops working at once; returns the new link                                                         | 200     | 401, 403, 404                                             |
| `POST /api/admin/households/[id]/sign-out`         | Sign the household out on every device                                                                                    | 204     | 401, 403, 404                                             |
| `POST /api/admin/staff` (changed)                  | Also refuses an address that is a household contact                                                                       | 201     | adds 409 `household_contact`                              |
| `POST /api/admin/guests/import` (changed)          | Accepts `contact_email` plus any `contact_email_2`, `contact_email_3`, … columns; errors per row and column               | 200     | as before                                                 |

- Responses never include an address in an error message. The invite-link responses are `{ "url": "https://…/i/…", "issued_at": "…" }` with `Cache-Control: no-store`.
- Removing an address takes effect for sign-in requests immediately.

## Direct data access (row-level security)

- `household_contacts`: staff read and write directly (the admin console uses this for lists); the triggers enforce uniqueness and the staff-address rule.
- `settings`: staff set `wedding_event_id` and the sign-in limits.
- `reissue_invite_link(household_id)` is callable by staff; the route above wraps it to return the URL.

## Campaign send (changed)

`POST /api/admin/campaigns/[id]/send` and the scheduled dispatch: one message per address of each deliverable household. The response counts gain `addresses` alongside `households`: `{ campaign_id, households, addresses, queued, sent, skipped: { no_email, opted_out, other }, failed }`. Templates receive `personal_link` (see [email-templates.md](./email-templates.md)).

## Admin console (temporary v0)

Plain, using the existing single stylesheet:

- Household detail: list of addresses with add, edit, remove, and each address's delivery flag; "Copy personal link"; "Reissue link" (with a confirmation that the old link stops working and that the new one must be sent); "Sign out everywhere" (with a confirmation).
- Household list: address count and a paper-only marker.
- Import page: documents the extra address columns.
- Settings: choose the wedding event (the personal links' cut-off) and the sign-in limits.
- Overview: a warning when no wedding event is chosen.
- Campaign preview and delivery status: counts and rows per address.
