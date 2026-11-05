# Data model: Personal invite links and shared household sign-in

Changes to the design in [`specs/001-guest-data-model/data-model.md`](../001-guest-data-model/data-model.md). Postgres (Supabase); every table has row-level security; roles as before: **anon**, **guest** (a signed-in household member), **staff** (couple or planner). This document is the design, not the migration.

## New: `household_contacts`

One row per way to reach a household. Only email for now; the deferred text-message feature adds phone numbers as another `kind`.

| Column             | Type                                 | Notes                                                      |
| ------------------ | ------------------------------------ | ---------------------------------------------------------- |
| `id`               | uuid PK                              |                                                            |
| `household_id`     | uuid not null → `households` cascade |                                                            |
| `kind`             | enum `contact_kind` (`email`)        |                                                            |
| `value`            | citext not null                      | the address, trimmed and lower-cased on write              |
| `delivery_problem` | boolean default false                | set by a bounce or complaint; cleared when `value` changes |
| `created_at`       | timestamptz default now()            |                                                            |

- Unique (`kind`, `value`): an address belongs to at most one household (FR-002).
- Check: `kind = 'email'` requires a valid email shape.
- Trigger: refuses a `value` that is the email of any staff account (FR-013); the staff-grant route refuses the reverse.
- Trigger: after insert, update or delete, sets `households.delivery_problem` to "any contact of this household has `delivery_problem`".
- RLS: staff all; guest `select` of rows where `household_id = current_household_id()` (the guest API masks values, R13); no guest writes; anon nothing. Changes are recorded in `audit_log` by column name only.

## Changed: `households`

| Change                                                         | Notes                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| drop `contact_email`                                           | data moves to `household_contacts` in the same migration                                                                     |
| `auth_user_id`                                                 | unchanged column; the Auth user now has a synthetic address (research R2) and is created with the household, contacts or not |
| add `invite_link_version integer not null default 1`           | incremented by "reissue link" (research R3)                                                                                  |
| add `invite_link_issued_at timestamptz not null default now()` |                                                                                                                              |
| `delivery_problem`                                             | now maintained by the `household_contacts` trigger; still staff-only                                                         |

- Paper only is derived: no rows in `household_contacts`.
- The trigger that cleared `delivery_problem` when `contact_email` changed moves to `household_contacts`.
- `invite_link_version` and `invite_link_issued_at` are staff-only columns (hidden from the `authenticated` role's guest reads, like `notes`), changed only through `reissue_invite_link(household_id)` (staff, audited).

## Changed: `settings`

| Column                          | Type                                    | Default | Notes                                          |
| ------------------------------- | --------------------------------------- | ------- | ---------------------------------------------- |
| `wedding_event_id`              | uuid null → `events` on delete set null | null    | personal links close on this event's date (R6) |
| `sign_in_limit_per_address`     | smallint                                | 3       | per `sign_in_window_minutes`                   |
| `sign_in_window_minutes`        | smallint                                | 10      |                                                |
| `sign_in_limit_global_per_hour` | integer                                 | 60      |                                                |

## New: `sign_in_attempts`

| Column         | Type                      | Notes                                                      |
| -------------- | ------------------------- | ---------------------------------------------------------- |
| `id`           | bigint identity PK        |                                                            |
| `address_hash` | text not null             | keyed SHA-256 of the normalised address, never the address |
| `at`           | timestamptz default now() |                                                            |

- Index on (`address_hash`, `at`) and on (`at`).
- RLS on, no policies: only the security-definer function `allow_sign_in_attempt(address_hash)` (service role) reads or writes. Rows older than one day are deleted by the existing cron schedule.

## Changed: `messages`

| Change                                                             | Notes                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| add `contact_id uuid null → household_contacts on delete set null` | the address the row is for; null on a skipped household row                  |
| replace unique (`campaign_id`, `household_id`)                     | with unique nulls not distinct (`campaign_id`, `household_id`, `contact_id`) |
| `to_email`                                                         | unchanged meaning: the address actually used, set when claimed               |

- Enqueue: each deliverable household gets one `queued` row per current contact; a household with no contacts or opted out gets one `skipped` row with `contact_id` null.
- Claim: re-reads the contact; a removed contact (`contact_id` now null on a `queued` row) becomes `skipped` with `no_email`.
- `record_message_event`: a bounce or complaint sets `household_contacts.delivery_problem` on the contact whose `value` still equals `to_email`.

## New and changed database functions

| Function                                                                          | Caller              | Purpose                                                                                   |
| --------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `invite_links_open()`                                                             | service role        | true before the wedding event's date in `America/Los_Angeles`, or when no event is chosen |
| `reissue_invite_link(household_id)`                                               | staff               | increments `invite_link_version`; audited                                                 |
| `revoke_household_sessions(household_id)`                                         | service role        | deletes the household Auth user's `auth.sessions` rows (research R10)                     |
| `allow_sign_in_attempt(address_hash)`                                             | service role        | applies the per-address and overall limits and records the attempt (research R12)         |
| `current_household_id()` (changed)                                                | policies            | also requires the caller's `session_id` to exist in `auth.sessions`                       |
| `create_household_record`, `set_household_contact`, `import_households` (changed) | staff               | take a list of addresses instead of one `contact_email`                                   |
| `resolve_audience`, `claim_campaign_messages`, `record_message_event` (changed)   | staff, service role | per-contact behaviour above                                                               |

## State: a personal link

```text
issued (version n) --reissue--> superseded (version n+1 issued)
issued --wedding day reached--> closed (all links; typed-address sign-in still works)
```

Opening checks, in order: token shape, HMAC for the current version, household has an Auth user, links open. Any failure: `/auth/error`.

## Requirement map

| Requirement (spec)                                             | Where                                                                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Several addresses, unique, staff-only edits (FR-001 to FR-003) | `household_contacts`, its triggers and RLS                                                                                 |
| Link lifetime, deadline, reissue, sign-out (FR-004 to FR-011)  | `invite_link_version`, `invite_links_open()`, `reissue_invite_link`, `revoke_household_sessions`, `current_household_id()` |
| Typed-address links and limits (FR-012 to FR-015)              | `sign_in_attempts`, `allow_sign_in_attempt`, settings limits                                                               |
| Shared editing, staff answers (FR-017, FR-018)                 | existing RSVP functions, unchanged attribution                                                                             |
| Campaigns per address (FR-019 to FR-023)                       | `messages.contact_id` and the changed messaging functions                                                                  |
| Privacy and deletion (FR-028)                                  | cascades from `households`; `to_email` nulled as today                                                                     |
