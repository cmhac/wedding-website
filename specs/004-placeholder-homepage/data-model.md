# Data Model: Placeholder homepage

No tables, columns, policies or migrations are added or changed. `src/types/database.ts` is untouched.

## Session (existing, read only)

The Supabase Auth session cookie. `getSession()` resolves it to `staff` (couple or planner, read from the `staff` table on every call) or `guest` (the user owns a household), or `null`. The page needs only "is there a session".

## Theme choice (browser only)

| Field   | Where                        | Values                         | Rules                                                                                                                                                                                             |
| ------- | ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme` | the visitor's `localStorage` | `"light"`, `"dark"`, or absent | Anything else is ignored. Absent means follow the device. Never sent to the server, never linked to a person or household. Reads and writes are wrapped so blocked storage never breaks the page. |

## Sign-in attempt (existing)

The durable per-address attempt record (`allow_sign_in_attempt`) keeps storing only a keyed hash of the address. Staff addresses typed at the prompt are counted the same way.
