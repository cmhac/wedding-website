# Contract: Audience filter

A campaign's `audience` is stored as JSON and validated with zod before saving (and again by `resolve_audience`). It selects **households**, since the household is the unit of email.

```json
{
  "scope": "all | household | filter",
  "household_id": "uuid (when scope = household)",
  "filters": {
    "invited_to_event": "event slug",
    "required_events_unanswered": true,
    "optional_event_unanswered": "event slug",
    "meals_not_chosen": true,
    "delivery_problem": true
  }
}
```

- `scope = all` takes no filters; `household` takes only `household_id`; `filter` takes one or more filters, combined with AND.
- `required_events_unanswered`: at least one guest in the household has `pending` on a **required** event. Optional events never count (FR-029).
- `optional_event_unanswered`: at least one guest invited to that optional event is `pending`.
- `meals_not_chosen`: at least one attending guest has a required course with no selection.
- `delivery_problem`: the household has `delivery_problem = true`.

## Resolution output

`resolve_audience` returns every matching household with:

| Field         | Meaning                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `deliverable` | true when the household has a contact email and (for non-essential types) has not opted out |
| `skip_reason` | `no_email`, `opted_out`, or null                                                            |

Households with no email are returned (so the UI can list them for paper invitations) but are never sent to.

## Examples

- Reminder to non-responders: `{"scope":"filter","filters":{"required_events_unanswered":true}}`
- Rehearsal invitation: `{"scope":"filter","filters":{"invited_to_event":"rehearsal"}}`
- Catch-up for one late addition: `{"scope":"household","household_id":"…"}`

## Tests

Jest tests cover schema validation (invalid combinations rejected). pgTAP tests cover resolution against a seeded list, including: a household answered on required events but pending on the welcome party is excluded from the first example and included by `optional_event_unanswered: "welcome-party"`; opted-out households are skipped for reminders but not for `is_essential` types.
