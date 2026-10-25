# Data Model: Admin Console v0

**No new tables, views or functions, and one small additive column** (`meal_selection_history.actor_kind`, see "Attributing answers" and gap G2). The console reads and writes the data described in [`specs/001-guest-data-model/data-model.md`](../001-guest-data-model/data-model.md), under row-level security, as the signed-in staff member. This document lists what is new: the screen-shaped objects the console builds from that data, the rules for combining it, and the gaps found.

## Screen objects

Plain objects returned by the functions in `src/lib/admin/`. They hold only what the screen shows. They are never sent to the browser unless a client component needs them, and they carry no secret.

| Object            | Built from                                                                            | Fields (summary)                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OverviewData`    | `event_counts`, `household_rsvp_progress`, `settings`, household and duplicate counts | Per-event invited, attending, declined, pending; counts of households owing required answers, optional answers, meals, with a delivery problem, paper-only, possible duplicates |
| `HouseholdRow`    | `staff_households()` joined with `staff_guests()` and `household_rsvp_progress`       | Id, name, guest names, contact email or none, plus-ones allowed and named, outstanding counts, flags (delivery problem, paper only, possible duplicate)                         |
| `HouseholdDetail` | One household, its guests, invitations, answers, meal choices and dietary entries     | All household fields including staff-only ones; guests with kind and dietary needs; one `AnswerRow` per guest per event                                                         |
| `AnswerRow`       | `staff_invitations()`, latest matching `rsvp_history`, `meal_selections`, `staff`     | Guest, event, status, `AnsweredBy`, answered-at (Pacific), meal choices each with their own `AnsweredBy`                                                                        |
| `AnsweredBy`      | The attribution rules below                                                           | One of: `guest`, `staff` (with name), `former_staff`, `unknown`, `shared_account`; plus time                                                                                    |
| `EventRow`        | `events`, `event_counts`                                                              | Name, key, start (Pacific), venue, required or optional, group, own deadline, order, invited count                                                                              |
| `MenuView`        | `menus`, `courses`, `dishes`, `dish_tags`, `dietary_categories`, `dish_totals`        | Status; per course its dishes with description, tags (with "suitable for" or "contains"), chosen count, archived flag                                                           |
| `CampaignRow`     | `campaigns`, `message_types`                                                          | Name, message type, audience summary in words, status, scheduled time (Pacific), last error in plain words                                                                      |
| `AudiencePreview` | `resolve_audience()`                                                                  | Households that will be emailed; skipped ones each with a reason (no email, opted out)                                                                                          |
| `DeliveryRow`     | `messages` joined with household names                                                | Household, status, detail in words, last update (Pacific)                                                                                                                       |
| `ReportRows`      | `dish_totals`, `dietary_list`, `meal_conflicts` joined with `meal_selections`         | Dish totals with "not yet chosen" rows; dietary list; conflicts with who made the choice                                                                                        |
| `HistoryRow`      | `audit_log`, `rsvp_history`, `meal_selection_history`, `staff`                        | When (Pacific), who, what, action, fields changed, or status and dish changes with source                                                                                       |
| `StaffRow`        | `staff`                                                                               | Name, role                                                                                                                                                                      |

## Rules for combining data

**Households and guests (research R9).** `staff_households()` returns no guest names, so the list function fetches `staff_guests()` and joins in memory. Search matches a household's name or any of its guests' names, ignoring capitals and accents. Filters (invited to an event, outstanding answers, delivery problem, paper only) and paging (25 per page) are applied after the join.

**Paper-only.** A household whose `contact_email` is empty. It is listed, labelled, and appears in audience previews with the reason "No email on file".

**Plus-ones.** Allowed is `plus_one_allowance`; named is the count of guests with `is_plus_one` and not `is_placeholder`. The "unnamed" seats are guests with `is_placeholder`.

**Attributing answers (research R8).** `AnsweredBy` is worked out in this order:

1. For an RSVP, find the newest `rsvp_history` row for the guest and event whose `new_status` equals the current status. `actor_kind` `guest` gives `guest`; `couple` or `planner` gives `staff` with the name from `staff` where `staff.user_id = changed_by`, or `former_staff` if that person is gone; `system` shows as "System".
2. If there is no history row (an invitation still at its default), the answer is "Not answered".
3. For a meal choice, find the newest `meal_selection_history` row for the guest and course whose `new_dish_id` is the current dish, and read its `actor_kind` exactly as in rule 1 (staff name from `staff` where `staff.user_id = changed_by`).
4. If that row's `actor_kind` is empty (written before the migration), compare `changed_by` with the household's `auth_user_id` and with `staff.user_id`: only the household account gives `guest`; only a staff match gives `staff`; both gives `shared_account`; neither gives `unknown`.
5. The history pages use the stored `actor_kind` for both RSVPs and meals, and rule 4 for empty ones.

Every screen that shows an RSVP or a meal choice shows `AnsweredBy` next to it (requirement FR-013a).

**Time.** Stored values are exact moments (UTC). Screens format them in Pacific time through one helper, and form values typed as Pacific local time are converted back through the same helper (research R7).

**Campaign states in the UI.** The editor is available only while the campaign is `draft` or `scheduled`; `sending`, `done` and `cancelled` are read-only, matching the database rule. "Send now" is offered for `draft` and `scheduled` only, and the handler's `campaign_not_sendable` refusal is still shown if the state changed meanwhile.

**Menu status in the UI.** Draft is visible to staff only, published lets guests choose, closed lets guests view only. Staff can record choices in any status.

## Writes that do not read back

Staff can update the staff-only household columns (`notes`, `address`, `rsvp_deadline_override`, `delivery_problem`) with a plain table update, but a plain read of those columns back from the table is refused. Actions that save them ask for no row in return, and the page reloads through `staff_households()`. A `select *` on `households`, `guests` or `invitations` is refused for everyone, so every read names its columns or uses the staff functions.

## Gaps found (requirement FR-030: recorded, not worked around)

| #   | Gap                                                                                   | Effect in v0                                                                                                                                       | Proposed follow-up                                                 |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| G1  | The import accepts CSV only.                                                          | **Closed by this feature:** the planned exception in [contracts/import-excel.md](./contracts/import-excel.md).                                     | None.                                                              |
| G2  | `meal_selection_history` stored who acted but not whether they were a guest or staff. | **Closed by this feature** with an additive migration (research R8). Rows from before it show "Unknown" only if the account comparison also fails. | None.                                                              |
| G3  | `staff_households()` has no guest names.                                              | Joined in the app (small scale).                                                                                                                   | A search function only if the list ever grows past a few thousand. |
| G4  | `audit_log` stores `actor_user_id` and kind, not a name.                              | Names come from `staff`; a removed staff member shows as "Staff (former member)".                                                                  | None needed.                                                       |
| G5  | `staff` holds names and roles but not email addresses (those are in the auth system). | The staff list shows names only.                                                                                                                   | None needed for v0.                                                |
| G6  | `meal_conflicts` does not say who made the choice.                                    | Joined with `meal_selections`.                                                                                                                     | None needed.                                                       |
| G7  | `/auth/error` is redirected to by the callback but nothing serves it.                 | **Closed by this feature** with a minimal page (research R11).                                                                                     | The designer replaces the page.                                    |

## Validation in the console

Form input is validated with zod before any call, with messages in plain words. The rules mirror what the database enforces, so the person hears about a problem before sending it, and the database stays the final check: email format, allowance a whole number from 0, required names, event key lowercase letters, digits and hyphens, Pacific date-times that actually exist, course and dish names present, campaign audience shape (reusing the existing audience schema in `src/lib/campaigns/audience.ts`).
