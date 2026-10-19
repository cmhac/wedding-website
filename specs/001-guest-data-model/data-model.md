# Data Model: Guest, Invitation, and Communication

Postgres (Supabase). Every table has row-level security. Roles used below: **anon** (not signed in), **guest** (signed-in household responder), **staff** (couple or planner). Types are generated into `src/types/database.ts`; this document is the design, not the migration.

Conventions: `id uuid primary key default gen_random_uuid()`, `created_at`/`updated_at timestamptz`, `citext` for emails, enums for fixed sets. Migrations are split by concern, in this order:

1. `extensions_and_enums`
2. `staff_and_settings`
3. `households_and_guests`
4. `events_and_invitations`
5. `menus_and_dietary`
6. `messaging`
7. `audit_and_history`
8. `rpc_and_views`
9. `rls_policies`
10. `cron_jobs`

## Access summary

| Data                                               | anon | guest (own household only)          | staff                                          |
| -------------------------------------------------- | ---- | ----------------------------------- | ---------------------------------------------- |
| households, guests                                 | none | read; write only via RPC            | all                                            |
| events, menus, courses, dishes, dietary categories | none | read published/own-invited          | all                                            |
| invitations                                        | none | read own; respond via RPC           | all                                            |
| meal selections, guest dietary                     | none | read own; write via RPC             | all                                            |
| campaigns, messages, message events                | none | none                                | all                                            |
| audit log, history tables                          | none | none                                | read                                           |
| staff, settings                                    | none | none (read deadline through an RPC) | `staff` rows: couple only; settings: all staff |

There are no anonymous reads of any table. Guests reach their data only through the guest API in [guest-api.md](./contracts/guest-api.md).

## Entities

### staff

| Column         | Type                   | Notes                             |
| -------------- | ---------------------- | --------------------------------- |
| `user_id`      | uuid PK → `auth.users` | cascade on delete                 |
| `role`         | enum `staff_role`      | `couple` or `planner`             |
| `display_name` | text not null          | "Chris", "Hannah", planner's name |
| `created_at`   | timestamptz            |                                   |

- Helper `is_staff()` (security definer, stable) is true when the caller's `auth.uid()` is in `staff`; `is_couple()` likewise for role `couple`.
- RLS: all staff can read; only `couple` can insert, update, or delete. A trigger refuses any change that would leave zero `couple` rows, so the planner (who cannot edit this table) and accidents cannot lock the couple out (FR-041).

### settings (single row)

`default_rsvp_deadline timestamptz`, `rsvp_open boolean default true`, `couple_names text`, `last_dispatch_at timestamptz`. Constrained to one row (`id boolean primary key default true check (id)`). Staff read/write.

### households

| Column                   | Type                            | Notes                                                                         |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------- |
| `id`                     | uuid PK                         |                                                                               |
| `display_name`           | text not null                   | greeting and envelope name                                                    |
| `contact_email`          | citext unique null              | the responder's email; null = paper-only household                            |
| `auth_user_id`           | uuid unique null → `auth.users` | set when the sign-in account is created; `on delete set null`                 |
| `address`                | jsonb null                      | street, city, region, postal code, country (staff only; never logged)         |
| `plus_one_allowance`     | smallint default 0              | check ≥ 0                                                                     |
| `rsvp_deadline_override` | timestamptz null                |                                                                               |
| `reminders_opt_out`      | boolean default false           | non-essential messages only (FR-021)                                          |
| `message_to_couple`      | text null                       | written by the responder                                                      |
| `notes`                  | text null                       | staff only (still visible to planner, who has full access)                    |
| `delivery_problem`       | boolean default false           | set when a message bounces or complains; cleared when `contact_email` changes |

- Unique `contact_email` is what makes one email map to one sign-in account (research R2).
- Possible-duplicate detection (FR-005): a function `find_duplicate_households()` returns pairs with the same normalized display name or address; it flags, never merges.
- RLS: guest `select` where `auth_user_id = auth.uid()`; no guest insert/update/delete (writes go through RPCs). Staff all rows, but column privileges stop the `authenticated` role from inserting or deleting households or updating `contact_email` and `auth_user_id`: those changes go through the admin API route handlers, which also create, update, or remove the linked sign-in account.

### guests

| Column                    | Type                                | Notes                                         |
| ------------------------- | ----------------------------------- | --------------------------------------------- |
| `id`                      | uuid PK                             |                                               |
| `household_id`            | uuid not null → households, cascade |                                               |
| `first_name`, `last_name` | text                                | null for unnamed plus-one placeholders        |
| `email`                   | citext null                         | reference only; never used to sign in or send |
| `is_placeholder`          | boolean default false               | true for an unnamed plus-one seat             |
| `dietary_notes`           | text null                           | free-text restrictions                        |
| `notes`                   | text null                           | staff only                                    |

- Check: when `is_placeholder` is false, `first_name` and `last_name` are not null.
- Trigger: placeholder count per household cannot exceed `plus_one_allowance`; reducing the allowance below the number of named plus-ones is refused with a message (spec edge case) and unnamed placeholders above the new limit are removed.
- Unique per household on lower-cased (`first_name`, `last_name`) for non-placeholders (FR-005).
- RLS: guest `select` on rows whose household is theirs. Guest writes only through `submit_household_rsvp` and `name_plus_one`.

### events

| Column          | Type             | Notes                                                                       |
| --------------- | ---------------- | --------------------------------------------------------------------------- |
| `id`            | uuid PK          |                                                                             |
| `slug`          | text unique      | stable key used by site code, e.g. `welcome-party`, `rehearsal`, `ceremony` |
| `name`          | text not null    |                                                                             |
| `starts_at`     | timestamptz      |                                                                             |
| `venue_name`    | text             |                                                                             |
| `is_required`   | boolean not null | false for the welcome party and rehearsal (FR-029)                          |
| `group_key`     | text null        | e.g. `wedding-weekend` (FR-030)                                             |
| `rsvp_deadline` | timestamptz null | event-level override of the default                                         |
| `display_order` | smallint         |                                                                             |

RLS: guest `select` only for events they are invited to (through `invitations`); staff all.

### invitations

Merges the spec's Invitation and RSVP Response (always 1:1).

| Column         | Type                             | Notes                                        |
| -------------- | -------------------------------- | -------------------------------------------- |
| `guest_id`     | uuid → guests, cascade           | PK part                                      |
| `event_id`     | uuid → events, cascade           | PK part                                      |
| `status`       | enum `rsvp_status`               | `pending` (default), `attending`, `declined` |
| `responded_at` | timestamptz null                 |                                              |
| `responded_by` | uuid null → auth.users, set null | who answered (guest account or staff)        |
| `invited_at`   | timestamptz default now()        |                                              |
| `invited_by`   | uuid null → auth.users, set null |                                              |

State transitions: `pending → attending | declined`; `attending ↔ declined` while open; any change is written to `rsvp_history`. Moving to `declined` clears the guest's meal selections for that event (history keeps them).

- Effective deadline: `effective_rsvp_deadline(household, event) = coalesce(household.rsvp_deadline_override, event.rsvp_deadline, settings.default_rsvp_deadline)`. A guest write after the deadline, or when `settings.rsvp_open` is false, is refused; staff are not bound by it.
- Removing an invitation deletes the row; `rsvp_history` keeps the earlier answers without personal data.
- RLS: guest `select` own; staff all; no direct guest write.

### Menus

**menus**: `id`, `event_id unique → events cascade`, `status enum menu_status` (`draft`, `published`, `closed`; FR-035), `notes text`.

**courses**: `id`, `menu_id → menus cascade`, `name`, `display_order`, `requires_choice boolean default true`.

**dishes**: `id`, `course_id → courses cascade`, `name`, `description`, `archived_at timestamptz null`, unique (`id`, `course_id`).

**dietary_categories**: `key text PK` (e.g. `vegetarian`, `nuts`), `label`, `kind enum` (`diet` or `allergen`), `display_order`. Seeded with the standard set; staff can add (spec assumption).

**dish_tags**: (`dish_id`, `category_key`) PK. Meaning depends on kind: for `diet`, "suitable for"; for `allergen`, "contains".

RLS: guest can `select` menus with `status in ('published','closed')` for events they are invited to, plus their courses, non-archived dishes, tags, and categories. Drafts are staff-only. Staff all.

### guest_dietary

(`guest_id` → guests cascade, `category_key` → dietary_categories) PK, `severity enum` (`allergy`, `preference`), `details text null`. Free text for anything outside the categories lives in `guests.dietary_notes`. RLS: guest read own household; write via RPC; staff all. Applies to every event (spec assumption).

### meal_selections

| Column      | Type                             | Notes                                                                             |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `guest_id`  | uuid → guests cascade            | PK part                                                                           |
| `course_id` | uuid → courses cascade           | PK part                                                                           |
| `dish_id`   | uuid                             | composite FK (`dish_id`, `course_id`) → dishes, so the dish belongs to the course |
| `chosen_at` | timestamptz                      |                                                                                   |
| `chosen_by` | uuid null → auth.users, set null |                                                                                   |

Rules enforced by trigger (FR-034):

- The guest has an invitation to the course's event with status `attending`.
- The menu is `published` for guests (staff may write in any status).
- The dish is not archived.

`archive_dish(dish_id)` (staff RPC) writes `meal_selection_history` rows for every affected selection, deletes those selections, sets `archived_at`, and returns the affected guests so the couple can ask them again (FR-038).

**meal_selection_history**: `id bigint identity`, `guest_id null set null`, `course_id null set null`, `old_dish_id`, `new_dish_id`, `reason text` (`changed`, `declined`, `dish_archived`), `changed_by`, `changed_at`. No names.

### Messaging

**message_types**: `key text PK` (`save_the_date`, `invitation`, `rsvp_reminder`, `optional_events_reminder`, `update`), `label`, `is_essential boolean` (FR-021), `template_key text` (a key into the template registry; the content is supplied separately) (matches a file in `emails/`).

**campaigns**: `id`, `message_type_key → message_types`, `name`, `audience jsonb not null` (validated by [audience-filter.md](./contracts/audience-filter.md)), `status enum campaign_status` (`draft`, `scheduled`, `sending`, `done`, `cancelled`), `scheduled_for timestamptz null`, `created_by`, `started_at`, `completed_at`, `last_error_code text null` (for example `template_missing`). A check constraint `campaigns_audience_valid` calls `is_valid_audience(audience)` (allowed scopes and filter keys, per the audience-filter contract), so writes made directly by an admin frontend cannot store an invalid audience.

State transitions: `draft → scheduled → sending → done`; `draft | scheduled → cancelled`. Editing is allowed only in `draft` and `scheduled`; `sending` and later are immutable (FR-017).

**messages**: `id`, `campaign_id → campaigns cascade`, `household_id → households` (`on delete set null`), `to_email citext null` (the address actually used: set when the message is claimed for sending from the household's current `contact_email`, null while queued, so an address changed after queueing is used), `status enum message_status` (`queued`, `sending`, `sent`, `delivered`, `bounced`, `complained`, `failed`, `skipped`), `skip_reason text null` (`no_email`, `opted_out`, `already_responded`...), `provider_message_id text unique null`, `error_code text null`, `queued_at`, `sent_at`, `last_event_at`. **Unique (`campaign_id`, `household_id`)** is the database guarantee behind FR-020. `to_email` is deleted (set null) when the household is deleted.

**message_events**: `id bigint identity`, `provider_event_id text unique` (the Svix id; dedupes redeliveries), `message_id → messages cascade`, `type text`, `occurred_at timestamptz`. No payload body is stored (FR-026).

Status ranking used by the webhook: `queued 0 < sending 1 < sent 2 < delivered 3`; `bounced`, `complained`, `failed` are terminal and override ranks 0–3. An event updates the message only if it moves status forward in rank, or is terminal and the message is not yet terminal (FR-022). A `bounced` or `complained` event also sets `households.delivery_problem`.

RLS: staff only, on all three tables. Guests never see sends.

### audit_log

`id bigint identity`, `at timestamptz`, `actor_user_id uuid null`, `actor_kind text` (`couple`, `planner`, `guest`, `system`), `entity text`, `entity_id uuid`, `action text` (`insert`, `update`, `delete`), `changed_fields text[]`. Written by a trigger on households, guests, invitations, meal_selections, guest_dietary, events, menus, campaigns, staff. Column names only, never values, so it holds no personal data (FR-042, SC-006). RLS: staff read; no direct writes.

### rsvp_history

`id bigint identity`, `guest_id uuid null set null`, `event_id uuid null set null`, `old_status`, `new_status`, `changed_by uuid null`, `actor_kind text`, `changed_at`. Trigger on `invitations`. No names (FR-012). RLS: staff read.

## Views and functions

| Name                            | Kind     | Purpose                                                                                       |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `effective_rsvp_deadline(h, e)` | function | Deadline resolution above                                                                     |
| `event_counts`                  | view     | Per event: invited, attending, declined, pending (FR-023). `security_invoker`, staff only     |
| `dish_totals`                   | view     | Per event, course, dish: chosen count (attending guests only), plus "not yet chosen" (FR-039) |
| `dietary_list`                  | view     | Attending guests with restrictions, per event, household, severity, notes (FR-039)            |
| `meal_conflicts`                | view     | Chosen dishes that conflict with restrictions by the R9 rule (FR-037)                         |
| `household_rsvp_progress`       | view     | Per household: pending required, pending optional, pending meal choices                       |
| `resolve_audience(jsonb)`       | function | Households matching an audience filter, with skip reasons for the unreachable (FR-018)        |
| `find_duplicate_households()`   | function | Possible duplicates (FR-005)                                                                  |
| `import_households(jsonb)`      | function | All-or-nothing per household; returns per-row errors (FR-004)                                 |

All views use `security_invoker = true` so row-level security applies to the caller.

## Requirement coverage

| Spec requirements   | Where                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| FR-001–005          | households, guests, triggers, `find_duplicate_households`, `import_households`                |
| FR-006–008, 029–031 | events (required/optional, group, deadline), invitations, `effective_rsvp_deadline`           |
| FR-009–012          | invitations, rsvp_history, RPCs in [database-rpc.md](./contracts/database-rpc.md)             |
| FR-013–015, 040–042 | Auth user per household, `staff`, `is_staff()`, audit_log                                     |
| FR-016–022          | message_types, campaigns, messages, message_events, webhook, dispatch                         |
| FR-023–024, 039     | views, export routes in [http-endpoints.md](./contracts/http-endpoints.md)                    |
| FR-032–038          | menus, courses, dishes, dietary_categories, dish_tags, guest_dietary, meal_selections         |
| FR-025–028          | no anon reads; cascade and null-out rules; no scheduled deletion; one responder per household |

## Validation rules in application code (zod)

- Household contact email: valid format, unique (clear error naming no other household's data).
- Audience filter: validated against the schema in [audience-filter.md](./contracts/audience-filter.md) before a campaign is saved.
- CSV import rows: required columns, email format, plus-one allowance integer ≥ 0, event slugs exist.
