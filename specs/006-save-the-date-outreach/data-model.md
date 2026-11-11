# Data model: Save the date outreach

No new tables. Everything below is a new column, a widened constraint, a replaced function or a new function, each in a migration (constitution principle II).

## Changed tables

### `settings` (the one row)

| Column                   | Type                         | Notes                                                                                                           |
| ------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `save_the_date_place`    | text, null                   | The card's place line (for example a city). Staff edit.                                                         |
| `save_the_date_note`     | text, null                   | The card's short line (for example "Invitation to follow"). Staff edit.                                         |
| `save_the_date_revision` | integer, not null, default 1 | Bumped by a trigger when the place, note or `wedding_event_id` changes. Becomes the calendar file's `SEQUENCE`. |

The date is not stored here: it is the wedding event's `starts_at`, read as a calendar date in `America/Los_Angeles`. Couple names stay in `couple_names`.

### `households`

| Column            | Type              | Notes                                                                                                                   |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `first_opened_at` | timestamptz, null | When a signed-in device first loaded a guest page. Set once by `record_household_opened()`. Removed with the household. |

### `campaigns`

| Column    | Type                             | Notes                                                                                                               |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `is_test` | boolean, not null, default false | A rehearsal send. Locked once the campaign is sending, like `channel`. Ignored by the not-yet-sent audience filter. |

### `household_contacts` (phone rows only)

| Column                         | Type                                                    | Notes                                                                      |
| ------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `sms_consent_by`               | uuid, null, references `auth.users`, on delete set null | The staff member who marked or imported it. Null for a guest's own answer. |
| `sms_consent_note`             | text, null, at most 200 characters                      | Where the consent came from, for the couple's own reference.               |
| `sms_consent_overrode_decline` | boolean, not null, default false                        | True when a staff mark replaced a "declined" answer.                       |

Constraints changed:

- `household_contacts_consent_source_known`: the known sources become `first_sign_in`, `sign_in_prompt`, `staff`, `import`.
- `household_contacts_consent_complete`: a state other than `not_asked` still needs `at` and `source`; additionally, `by` is required when the source is `staff` or `import`, and `by`, `note` and `overrode_decline` must be empty or false when the state is `not_asked`.
- The reset trigger (a changed number is "not yet asked") also clears `by`, `note` and `overrode_decline`.

Grants: unchanged. Staff cannot write these columns directly; only the functions below can.

## State: a phone number's consent

```text
not_asked --(guest ticks)--------> opted_in   source first_sign_in | sign_in_prompt
not_asked --(staff mark / import)-> opted_in   source staff | import   (by, optional note)
not_asked --(guest unticks)------> declined    source first_sign_in
declined  --(guest ticks)--------> opted_in    (sign-in prompt, as today)
declined  --(staff override)-----> opted_in    source staff, overrode_decline = true
opted_in  --(staff clear)--------> not_asked   (all consent columns emptied)
any       --(number changed)-----> not_asked   (trigger)
```

A campaign texts only `opted_in`, whatever the source.

## Functions

| Function                                                                                                                         | Who                                  | What                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staff_set_sms_consent(household_ids uuid[], contact_id uuid, mode text, override_declined boolean, note text, dry_run boolean)` | `authenticated`, checks `is_staff()` | `mode` is `mark` or `clear`. With `contact_id`, acts on that one number (which must belong to one of the households); otherwise on every phone number of the households. All or nothing. `dry_run` changes nothing. Returns `{ marked, cleared, already, declined_skipped, households_without_phone, households }`. A single-number mark on a declined number needs `override_declined`. |
| `import_phone_consent(household_id uuid, value text, by uuid, override boolean)`                                                 | `service_role`                       | Marks one imported number `opted_in`, source `import`, only from `not_asked` (or from `declined` when `override`). Returns `marked`, `already`, `declined_skipped`.                                                                                                                                                                                                                      |
| `get_save_the_date()`                                                                                                            | `authenticated` (guest or staff)     | Returns `{ couple_names, date, place, note, revision, wedding_event_set }`, `date` as `YYYY-MM-DD`, or nulls when unset. Nothing about any household.                                                                                                                                                                                                                                    |
| `record_household_opened()`                                                                                                      | `authenticated` guest                | Sets the caller's `first_opened_at` if null. No-op for staff.                                                                                                                                                                                                                                                                                                                            |
| `resolve_audience(filter, message_type_key)`                                                                                     | replaced                             | Adds the `not_opened` filter; the not-yet-sent filter ignores `is_test` campaigns.                                                                                                                                                                                                                                                                                                       |
| `is_valid_audience(audience)`                                                                                                    | replaced                             | Accepts `not_opened: true`.                                                                                                                                                                                                                                                                                                                                                              |

## Messages

No schema change: the existing channel, `to_phone` and skip reasons cover everything. A test campaign's messages are ordinary rows under a campaign with `is_test`.

## Validation rules (from the spec)

- Marking a number never creates or changes the number.
- Declined numbers are skipped by a batch and need an explicit override on a single mark (FR-013).
- A changed number loses its mark (FR-015).
- The consent record is staff-only; guests see only their own household's masked numbers, as today.
