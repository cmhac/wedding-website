# Contract: Admin console pages and actions

The pages the console serves, what each reads, and what each can change. Nothing here adds a data-layer capability: every read and write is something the existing admin interfaces already provide ([`docs/admin-api.md`](../../../docs/admin-api.md) and [`specs/001-guest-data-model/contracts/database-rpc.md`](../../001-guest-data-model/contracts/database-rpc.md)). The wireframes for each screen are in [`../design/`](../design/README.md).

All pages are served from the `(admin)` route group (research R1). Every page and action requires a signed-in **staff** session (R2). A signed-out visitor is sent to `/admin/sign-in`; a guest account sees "You do not have access to this" with no data. Times are Pacific (R7).

## Pages

"Tab" and "confirm" are URL query values (R4). Wireframe names are the files in `design/` (without `.dc.html`).

| URL                      | Query                                                  | Wireframe         | Reads                                                                                                                                                           | Requirement                     |
| ------------------------ | ------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `/admin/sign-in`         |                                                        | `Main`            | Nothing (public page)                                                                                                                                           | FR-001, 002                     |
| `/auth/error`            |                                                        | (new, minimal)    | Nothing (public page)                                                                                                                                           | FR-001                          |
| `/admin`                 |                                                        | `Overview`        | `event_counts`, `household_rsvp_progress`, `settings`, `staff_households()`, `find_duplicate_households()`                                                      | FR-004                          |
| `/admin/households`      | `q`, `invited`, `show`, `page`, `view=duplicates`      | `Households`      | `staff_households()`, `staff_guests()`, `staff_invitations()`, `household_rsvp_progress`, `find_duplicate_households()`                                         | FR-005, 008, 009                |
| `/admin/households/new`  |                                                        | `Households`      | `events` (slugs for inviting)                                                                                                                                   | FR-006                          |
| `/admin/households/[id]` | `tab=details\|guests\|answers\|remove`, `confirm`      | `HouseholdDetail` | One household from `staff_households()`, its guests, `staff_invitations()`, `rsvp_history`, `meal_selections`, `guest_dietary`, `menus/courses/dishes`, `staff` | FR-005–007, 012, 013, 013a, 017 |
| `/admin/import`          |                                                        | `Import`          | Nothing until upload                                                                                                                                            | FR-010                          |
| `/admin/events`          | `tab=list\|edit\|invite`, `id`                         | `Events`          | `events`, `event_counts`, guests for the invite list                                                                                                            | FR-011, 012                     |
| `/admin/menus`           | `event` (slug), `tab=menu\|add\|categories`, `confirm` | `Menus`           | `events`, `menus`, `courses`, `dishes`, `dish_tags`, `dietary_categories`, `dish_totals`                                                                        | FR-014–016                      |
| `/admin/campaigns`       | `tab=list\|edit\|delivery`, `id`, `confirm`            | `Campaigns`       | `campaigns`, `message_types`, `events`, `resolve_audience()`, `messages` with household names                                                                   | FR-018–022                      |
| `/admin/reports`         | `event` (slug), `tab=dish\|diet\|conflicts\|exports`   | `Reports`         | `dish_totals`, `dietary_list`, `meal_conflicts`, `meal_selections`                                                                                              | FR-023, 024                     |
| `/admin/history`         | `tab=log\|rsvp\|meals`, `from`, `to`, `by`, `page`     | `History`         | `audit_log`, `rsvp_history`, `meal_selection_history`, `staff`                                                                                                  | FR-025                          |
| `/admin/settings`        | None (the person's role decides what shows)            | `Settings`        | `settings`, `staff`                                                                                                                                             | FR-026, 027, 003                |

Phone layout is the same pages at narrow width (research R5); the `Mobile-*` wireframes show it.

## Actions

**Server actions** (direct staff data access; each checks the session, validates the form, runs as the staff member, then refreshes the page). Failures return a plain message and keep what the person typed.

| Action                             | Does                                                                                                     | Underlying call                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `signOut`                          | Ends the session and goes to `/admin/sign-in`                                                            | Supabase auth sign out                      |
| `updateHouseholdFields`            | Saves everything except contact email: name, address, allowance, deadline override, opt-out, staff notes | `update` on `households` (no row read back) |
| `saveGuest`, `removeGuest`         | Add, edit, name a plus-one, or remove a guest; dietary notes; staff notes                                | `insert`/`update`/`delete` on `guests`      |
| `setGuestDietary`                  | Add or remove a guest's dietary category with severity                                                   | `guest_dietary`                             |
| `inviteGuests`, `removeInvitation` | Invite chosen guests to an event (no email sent); remove an invitation                                   | RPC `invite`; `delete` on `invitations`     |
| `recordRsvp`                       | Set a guest's answer for an event on their behalf (recorded as staff)                                    | RPC `staff_set_rsvp`                        |
| `recordMeal`                       | Set or clear a guest's dish for a course on their behalf (recorded as staff)                             | RPC `staff_set_meal`                        |
| `saveEvent`, `deleteEvent`         | Create or edit an event; delete one                                                                      | `events`                                    |
| `setMenuStatus`                    | Draft, published or closed                                                                               | `menus`                                     |
| `saveCourse`, `saveDish`           | Add or edit a course or a dish, with its dietary tags                                                    | `courses`, `dishes`, `dish_tags`            |
| `archiveDish`, `restoreDish`       | Retire a dish and report affected guests; bring one back                                                 | RPC `archive_dish`; `update` on `dishes`    |
| `saveCategory`                     | Add a dietary category                                                                                   | `dietary_categories`                        |
| `previewAudience`                  | Shows who a campaign would reach and who is skipped, without saving                                      | RPC `resolve_audience`                      |
| `saveCampaign`, `cancelCampaign`   | Save a draft or scheduled campaign (only while draft or scheduled); cancel one                           | `campaigns`                                 |
| `saveSettings`                     | Default RSVP deadline, RSVPs open                                                                        | `settings`                                  |

**Existing route handlers**, called by small client components through the typed wrappers in `src/lib/admin-api/client.ts` (these need the server secret):

| Used for                       | Handler                                                     | Wrapper                                  |
| ------------------------------ | ----------------------------------------------------------- | ---------------------------------------- |
| Staff sign-in link             | `POST /api/admin/sign-in`                                   | `requestStaffSignIn` (new)               |
| Create a household with guests | `POST /api/admin/households`                                | `createHousehold`                        |
| Change contact email           | `PATCH /api/admin/households/[id]`                          | `updateHousehold`                        |
| Delete a household             | `DELETE /api/admin/households/[id]`                         | `deleteHousehold`                        |
| Import CSV or Excel            | `POST /api/admin/guests/import`                             | `importGuests`, `importGuestsFile` (new) |
| Send a campaign now            | `POST /api/admin/campaigns/[id]/send`                       | `sendCampaign` (new)                     |
| Exports                        | `GET /api/admin/exports/[kind]`                             | plain links (download)                   |
| Grant or revoke planner access | `POST /api/admin/staff`, `DELETE /api/admin/staff/[userId]` | `grantStaff`, `revokeStaff` (new)        |

The "new" wrappers do not change any route handler; they only call it. The one route handler that changes is the import (see [import-excel.md](./import-excel.md)).

## Error messages

Every API or database refusal is shown as plain text, never raw. The mapping lives in one function (`src/lib/admin/messages.ts`) covering every code in the table in `docs/admin-api.md` (success criterion SC-006), plus the refusals the database raises directly (allowance below named plus-ones, duplicate guest name, last couple member, invalid meal for a declined guest, archived dish). A test lists every code and fails if one has no message.

## Guards on every page and action

1. No session: pages redirect to `/admin/sign-in`; actions return the "session ended" message.
2. Session is a guest: "You do not have access to this."
3. Session is a planner on a couple-only action (grant or revoke staff): the control is not shown, and the handler still refuses with 403.
