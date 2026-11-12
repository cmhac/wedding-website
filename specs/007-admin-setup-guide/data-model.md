# Data model: Admin setup guide

Two new tables, no change to existing ones. Both have row-level security. Status of a step is never stored.

## `setup_guide_state` (one row per staff member)

| Column          | Type                                | Notes                                                                                                                                                          |
| --------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`       | uuid, primary key                   | References `auth.users` on delete cascade. The row is the person's own.                                                                                        |
| `skipped_steps` | text[] not null, default `{}`       | Step keys the person skipped. A skipped step still counts as open.                                                                                             |
| `last_step`     | text, nullable                      | Step key last viewed; resume opens here if still open, else the first open step.                                                                               |
| `left_guide`    | boolean not null, default false     | True after the person closes the guide by any route. Shows the compact reminder.                                                                               |
| `seen_required` | text[] not null, default `{}`       | The required step keys that existed when `left_guide` was last set. A required key missing from this list brings the full banner back and clears `left_guide`. |
| `updated_at`    | timestamptz not null, default now() | Set by trigger.                                                                                                                                                |

**Policies**: select, insert, update and delete only where `user_id = auth.uid()` and `is_staff()`. No policy for anon or guests. Restart deletes the person's row.

**Constraints**: each array has at most 30 elements and each key matches `^[a-z0-9_]{1,40}$` (a check using `array_length` and a regex over unnested keys, kept to a simple constraint function).

## `setup_confirmations` (shared)

| Column         | Type                                | Notes                                       |
| -------------- | ----------------------------------- | ------------------------------------------- |
| `step_key`     | text, primary key                   | Only for steps of kind `manual`.            |
| `confirmed_by` | uuid, nullable                      | References `auth.users` on delete set null. |
| `confirmed_at` | timestamptz not null, default now() |                                             |

**Policies**: staff may select, insert and delete; nobody else. The couple's restart does not clear it (it is about the site, not the person); a staff member can un-confirm one step.

## Derived (not stored)

**Setup status**: for each catalogue step, `done` or `open` plus a reason, computed by `status.ts` from the settings row, environment presence, texting state and confirmations. **Banner mode** (`hidden`, `compact`, `full`) is computed from status and the person's row: hidden if no required step is open; compact if `left_guide` and every open required key is in `seen_required`; otherwise full.
