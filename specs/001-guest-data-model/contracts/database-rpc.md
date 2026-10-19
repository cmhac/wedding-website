# Contract: Database functions (RPC)

Called from Next.js server code with the signed-in user's session (never the service-role key unless stated). Guests have no direct write access to any table; these functions are their only write path. All are `SECURITY DEFINER` with a fixed `search_path`, and each begins by identifying the caller from `auth.uid()` and checking the rule below. Errors are raised with stable codes so the UI can show specific messages without leaking other households' data. Each error is a Postgres exception with SQLSTATE `P0001` whose **message is exactly the code word** (for example `rsvp_closed`), so route handlers match on the message. Some errors add a `detail` (for `invalid_payload`, a JSON list of `{row, field, message}`).

| Code                | Meaning                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not_a_guest`       | The caller is anonymous or has no household                                                                                                                                                |
| `forbidden`         | The caller is not allowed to touch that household, guest, or event, or is not staff                                                                                                        |
| `rsvp_closed`       | RSVPs are switched off, or the effective deadline has passed for a changed answer                                                                                                          |
| `not_a_placeholder` | `name_plus_one` on a guest who is already named                                                                                                                                            |
| `invalid_payload`   | The payload is malformed (bad uuid, unknown dietary category, severity not `allergy` or `preference`, answer not `attending` or `declined`, blank name, a household that fails validation) |
| `invalid_meal`      | A meal choice the rules refuse: guest not attending that event, menu not `published` (for guests), archived dish, dish not in the course, unknown course                                   |
| `duplicate_name`    | `name_plus_one` would duplicate another guest's name in the household                                                                                                                      |
| `email_in_use`      | The contact email belongs to another household                                                                                                                                             |
| `not_found`         | A staff function was given an id that does not exist                                                                                                                                       |

Callable without a session: only the guest-facing functions (`get_my_rsvp`, `submit_household_rsvp`, `name_plus_one`, `set_reminders_opt_out`), which answer `not_a_guest`. Every other function is not executable by `anon` at all (the call fails with a permission error, SQLSTATE `42501`).

## Guest-facing

### `get_my_rsvp()` → jsonb

Returns the caller's household, its guests (names, placeholder flag, dietary categories and notes), and for each guest the invitations with `status`, the event fields, the effective deadline, whether the event is optional, and for events with a published menu the courses and dishes (with tags) plus the guest's current selections.

Also returns top-level `dietary_categories` (`key`, `label`, `kind`). The shape is documented in [guest-api.md](./guest-api.md). A `menu` (status `published` or `closed`, courses, non-archived dishes with tags, and the guest's `selection`) is present only on invitations the guest is attending whose event has such a menu; draft menus and archived dishes never appear. Only the caller's household is returned, and never `notes`, addresses, or other households' ids.

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
- Refused with `rsvp_closed` when `settings.rsvp_open` is false (the whole payload), or when an answer or meal choice would **change** for an event whose effective deadline for that household has passed. A partly past-deadline payload fails atomically. Sending back an answer or choice that is already stored is never an error, so a form may resubmit everything. Dietary notes, structured dietary needs, and `message_to_couple` are bound only by `settings.rsvp_open`, so an allergy can still be reported after a deadline. Staff (including a planner who is also a responder) are bound by neither.
- `responses` are applied first, then `dietary`, then `meals`, so a payload may answer `attending` and choose meals together; choosing a meal for an event declined in the same payload is `invalid_meal`.
- `dietary`, when present, **replaces** the guest's structured dietary rows; `[]` clears them. `category_key` must exist in `dietary_categories`.
- `status` in a response must be `attending` or `declined` (`pending` is `invalid_payload`).
- A `meals` entry requires the guest to be `attending` that event (in this payload or already stored), a published menu, a non-archived dish belonging to the course; otherwise `invalid_meal`. Choosing for an event the guest declines is rejected, not ignored.
- Setting `declined` removes that guest's meal selections for the event.
- A required course with no selection is allowed (the household can save partial progress); progress is shown from `household_rsvp_progress`.
- All changes are written in one transaction; history and audit rows are produced by triggers.

Returns the updated `get_my_rsvp()` result.

### `name_plus_one(guest_id uuid, first_name text, last_name text)` → guest

Fills a placeholder in the caller's household and returns the guest as `{id, first_name, last_name, is_placeholder, dietary_notes}`. Names are trimmed. Errors, checked in this order: `forbidden`, `not_a_placeholder`, `invalid_payload` (blank name), `rsvp_closed` (RSVPs off, or every event the seat is invited to is past its deadline), `duplicate_name`.

### `set_reminders_opt_out(opt_out boolean)` → boolean

Turns reminder emails off (`true`) or on (`false`) for the caller's household only, and returns the new value. Affects non-essential message types only: essential types (invitation, save-the-date, update) still reach an opted-out household. Errors: `not_a_guest` (anonymous, or no household), `invalid_payload` (null). The change is audited as a guest action on `reminders_opt_out`. The matching endpoint is `POST /api/guest/opt-out` in [guest-api.md](./guest-api.md).

## Staff-only (caller must be in `staff`; otherwise `forbidden`)

| Function                                                                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `staff_set_rsvp(guest_id, event_id, status)`                                                   | Answer on a household's behalf (`pending`, `attending`, `declined`); ignores deadlines; the staff member is `responded_by`; returns `{guest_id, event_id, status, responded_at}`; `not_found` if there is no such invitation                                                                                                                                                                                                                                                         |
| `staff_set_meal(guest_id, course_id, dish_id)`                                                 | Same, for meals; any menu status; a null `dish_id` clears the choice; `invalid_meal` for a declined guest, archived dish, or dish not in the course; returns `{guest_id, course_id, dish_id}`                                                                                                                                                                                                                                                                                        |
| `archive_dish(dish_id)` → `[{guest_id, household_id}]`                                         | Archives the dish, moves affected selections to history (reason `dish_archived`), returns who must choose again (FR-038); archiving twice returns nothing; `not_found` for an unknown dish                                                                                                                                                                                                                                                                                           |
| `invite(guest_ids uuid[], event_id)` → `{added, existing, unknown}`                            | Adds invitations without touching existing ones or triggering any send (FR-031); `not_found` for an unknown event                                                                                                                                                                                                                                                                                                                                                                    |
| `resolve_audience(filter jsonb, message_type_key text default null)` → rows                    | `{household_id, display_name, deliverable boolean, skip_reason}`; the preview shown before a send (FR-018). Also callable by the service role. With a `message_type_key`, households that opted out are `opted_out` unless the type is essential; without one the opt-out is not applied here (the claim step applies it). `invalid_payload` for an audience that fails the audience check, `not_found` for an unknown type                                                          |
| `import_households(rows jsonb)` → `{created, errors, household_ids}`                           | Each household and its guests are created together or not at all (FR-004); also callable by the service role. See below                                                                                                                                                                                                                                                                                                                                                              |
| `find_duplicate_households()` → `[{household_a, household_b, reasons}]`                        | Pairs with the same normalized display name (`display_name`) or address (`address`); flags only, never merges                                                                                                                                                                                                                                                                                                                                                                        |
| `create_household_record(payload jsonb)` → `{household_id, guest_ids, invitations}`            | Creates a household with its guests and invitations, attributed to the signed-in staff member. The route handler creates the sign-in account first and passes `auth_user_id`. Payload: `{display_name, contact_email, auth_user_id, address, notes, plus_one_allowance, rsvp_deadline_override, guests: [{first_name, last_name, email, dietary_notes, notes, is_placeholder, is_plus_one, events: [slug]}]}`. Errors: `email_in_use`, `invalid_payload` (detail lists the problems) |
| `set_household_contact(household_id, contact_email, auth_user_id)` → `{previous_auth_user_id}` | Changes the contact email and the linked sign-in account together (the columns cannot be written directly), attributed to the staff member. A null email unlinks (paper-only). A new email clears `delivery_problem`. Errors: `email_in_use`, `invalid_payload` (bad email format), `not_found`                                                                                                                                                                                      |
| `delete_household_record(household_id)` → `{auth_user_id, auth_user_is_staff}`                 | Deletes the household with its guests, invitations, answers, and choices, attributed to the staff member. Returns the sign-in account that was linked so the route handler can remove it, unless `auth_user_is_staff` is true (then it must be kept). `not_found` for an unknown household                                                                                                                                                                                           |

`create_household_record`, `set_household_contact`, and `delete_household_record` are staff-only (not the service role): they exist so that the admin route handlers, which call them with the signed-in staff member's session after using the service-role key for the sign-in account itself, leave an `audit_log` row naming that staff member. Staff can also update the other household columns (everything except `contact_email` and `auth_user_id`) directly.

### `import_households(rows)`

`rows` is an array of households:

```json
[
  {
    "ref": "string (echoed back)",
    "row": 2,
    "display_name": "string",
    "contact_email": "string | null",
    "paper_only": false,
    "plus_one_allowance": 0,
    "guests": [
      {
        "row": 2,
        "first_name": "string",
        "last_name": "string",
        "email": "string | null",
        "dietary_notes": "string | null",
        "notes": "string | null",
        "events": ["event-slug"]
      }
    ]
  }
]
```

Returns `{"created": {"households", "guests", "invitations"}, "errors": [{"row", "field", "message"}], "household_ids": [{"ref", "household_id"}]}`. A household with any error is not created at all; the others in the same call are. Errors are sorted by row; a household-level error uses the household's `row`, else its first guest's. Rules: `display_name` required; `contact_email` valid and not used by another household (existing, or earlier in the same call; the message names no other household); a `paper_only` household has no email; `plus_one_allowance` a whole number ≥ 0; at least one guest; guests need both names, no duplicate names in a household, a valid `email`, and existing event slugs. The import creates **no sign-in accounts**: `auth_user_id` stays null, and the caller links accounts afterwards with `set_household_contact` (or the service role) using `household_ids`. The import also creates no placeholder plus-one seats.

Staff functions run with the caller's identity, so audit and history rows attribute the change to Chris, Hannah, or the planner.

## Service-role only (called by route handlers)

| Function                                                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim_campaign_messages(campaign_id, limit)` → `[{id, household_id, to_email}]`         | Atomically moves up to `limit` `queued` messages of a `sending` campaign to `sending` (`for update skip locked`) and returns them with the household's current `contact_email` written to `to_email`, so concurrent runs never double-send. A message that cannot be sent any more is marked `skipped` instead and not returned (`household_missing`, `no_email`, or `opted_out` for a non-essential type); a message stuck in `sending` for over 15 minutes (a worker that died) with no `provider_message_id` is claimed again; a batch that only skips keeps going, so an empty result means nothing is left |
| `record_message_event(provider_event_id, provider_message_id, type, occurred_at)` → text | Dedupes by event id, applies the status ranking, sets `delivery_problem` on bounce or complaint (unless the address has changed since the message was sent). `type` is the provider's event name (`email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`). Returns `applied`, `ignored` (including unhandled types), `duplicate`, or `unknown_message`; none of these is an error                                                                                                                                                                                                 |
| `due_scheduled_campaigns()` → `[{id}]`                                                   | Campaigns with `status = 'scheduled'` and `scheduled_for <= now()`, earliest first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Execute permission on these is revoked from `anon` and `authenticated`. (`import_households` is also callable by the service role, with no signed-in user; its audit rows then show actor kind `system`.)

## Test obligations (pgTAP)

For each function: a success case; a wrong-household case; an anonymous caller; a guest calling a staff function; the deadline-closed case where relevant. Plus the cross-cutting policy tests listed in [quickstart.md](../quickstart.md).
