# Contract: Database functions (RPC)

Called from Next.js server code with the signed-in user's session (never the service-role key unless stated). Guests have no direct write access to any table; these functions are their only write path. All are `SECURITY DEFINER` with a fixed `search_path`, and each begins by identifying the caller from `auth.uid()` and checking the rule below. Errors are raised with stable codes so the UI can show specific messages without leaking other households' data.

## Guest-facing

### `get_my_rsvp()` → jsonb

Returns the caller's household, its guests (names, placeholder flag, dietary categories and notes), and for each guest the invitations with `status`, the event fields, the effective deadline, whether the event is optional, and for events with a published menu the courses and dishes (with tags) plus the guest's current selections.

Errors: `not_a_guest` (caller has no household).

### `submit_household_rsvp(payload jsonb)` → jsonb

Payload (validated by zod before the call, and again in the function):

```json
{
  "message_to_couple": "string | null",
  "guests": [
    {
      "guest_id": "uuid",
      "dietary_notes": "string | null",
      "dietary": [
        {
          "category_key": "nuts",
          "severity": "allergy",
          "details": "string | null"
        }
      ],
      "responses": [{ "event_id": "uuid", "status": "attending | declined" }],
      "meals": [{ "course_id": "uuid", "dish_id": "uuid" }]
    }
  ]
}
```

Rules:

- Every `guest_id` belongs to the caller's household, and every `event_id` is one that guest is invited to; otherwise `forbidden`.
- Refused with `rsvp_closed` when `settings.rsvp_open` is false or the effective deadline for that household and event has passed. A partly past-deadline payload fails atomically.
- A `meals` entry requires the guest to be `attending` that event (in this payload or already stored), a published menu, a non-archived dish belonging to the course; otherwise `invalid_meal`. Choosing for an event the guest declines is rejected, not ignored.
- Setting `declined` removes that guest's meal selections for the event.
- A required course with no selection is allowed (the household can save partial progress); progress is shown from `household_rsvp_progress`.
- All changes are written in one transaction; history and audit rows are produced by triggers.

Returns the updated `get_my_rsvp()` result.

### `name_plus_one(guest_id uuid, first_name text, last_name text)` → guest

Fills a placeholder in the caller's household. Errors: `forbidden`, `not_a_placeholder`, `rsvp_closed`.

## Staff-only (caller must be in `staff`; otherwise `forbidden`)

| Function                                               | Purpose                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `staff_set_rsvp(guest_id, event_id, status)`           | Answer on a household's behalf; ignores deadlines; recorded with the staff member as `responded_by`           |
| `staff_set_meal(guest_id, course_id, dish_id)`         | Same, for meals                                                                                               |
| `archive_dish(dish_id)` → `[{guest_id, household_id}]` | Archives the dish, moves affected selections to history, returns who must choose again (FR-038)               |
| `invite(guest_ids uuid[], event_id)`                   | Adds invitations without touching existing ones or triggering any send (FR-031)                               |
| `resolve_audience(filter jsonb)` → rows                | `{household_id, deliverable boolean, skip_reason}`; the preview shown before a send (FR-018)                  |
| `import_households(rows jsonb)` → `{created, errors}`  | Each household and its guests are created together or not at all; errors carry row number and reason (FR-004) |
| `find_duplicate_households()`                          | Possible duplicates, flagged only                                                                             |

Staff functions run with the caller's identity, so audit and history rows attribute the change to Chris, Hannah, or the planner.

## Service-role only (called by route handlers)

| Function                                                                          | Purpose                                                                                                                           |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `claim_campaign_messages(campaign_id, limit)`                                     | Atomically moves `queued` messages to `sending` (`for update skip locked`) and returns them, so concurrent runs never double-send |
| `record_message_event(provider_event_id, provider_message_id, type, occurred_at)` | Dedupes by event id, applies the status ranking, sets `delivery_problem` on bounce or complaint                                   |
| `due_scheduled_campaigns()`                                                       | Campaigns with `status = 'scheduled'` and `scheduled_for <= now()`                                                                |

Execute permission on these is revoked from `anon` and `authenticated`.

## Test obligations (pgTAP)

For each function: a success case; a wrong-household case; an anonymous caller; a guest calling a staff function; the deadline-closed case where relevant. Plus the cross-cutting policy tests listed in [quickstart.md](../quickstart.md).
