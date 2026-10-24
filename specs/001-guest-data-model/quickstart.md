# Quickstart: Validate the data model end to end

A validation guide, not an implementation guide. No screens or email content are built here, so guest scenarios run through the guest API (`scripts/guest-api-smoke.ts`), and admin scenarios run through the admin API (the route tests, `curl`, or the scripts in `scripts/`) rather than a browser. It assumes the tasks in `tasks.md` are done. Contracts: [database-rpc.md](./contracts/database-rpc.md), [http-endpoints.md](./contracts/http-endpoints.md), [audience-filter.md](./contracts/audience-filter.md). Design: [data-model.md](./data-model.md).

## Prerequisites

- Node 26 (`nvm use`), Docker running, `npm install`
- `cp .env.example .env.local`, then fill in the values from `npm run db:start`
- New server-only variables (add names to `.env.example`, never real values):
  - `SEND_EMAIL_HOOK_SECRET` (Supabase auth hook)
  - `RESEND_WEBHOOK_SECRET` (Resend webhook)
  - `CRON_SECRET` (bearer for the scheduled dispatch route)
  - `GUEST_RSVP_PATH` (non-secret; default `/rsvp`, where the guest frontend serves the RSVP)
- Manual, outside the repo (record the final state in `docs/`):
  - Verify the sending domain in Resend (DNS records) before any production send
  - Create the Resend webhook pointing at `/api/webhooks/resend` for sent, delivered, bounced, and complained events
  - In Supabase Auth settings, enable the Send Email hook pointing at `/api/auth/send-email`; turn off open sign-ups
  - Store `CRON_SECRET` and the site URL in Supabase Vault for the `pg_cron` job

## Run

```bash
npm run db:start && npm run db:reset   # applies migrations and seed.sql (fake data only)
npm run db:types                       # regenerates src/types/database.ts
npm run dev
```

## Validation scenarios

Email content is out of scope, so there are no real templates to send. Scenarios that send campaign emails (7 to 10) run as automated route tests with fixture templates; run them by hand only after real templates are registered in `emails/index.ts`. Locally, the auth hook stays off and sign-in emails use Supabase's built-in email through local mail capture.

Each maps to a spec user story and to an automated test; run them by hand once against the local stack.

| #   | Scenario                                                                                                           | Expected                                                                                        | Spec           |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------- |
| 1   | Import the sample CSV with one bad row                                                                             | Valid households created; bad row reported with row and reason; no partial household            | US1, FR-004    |
| 2   | Invite two guests to the rehearsal and all to the ceremony                                                         | Per-guest invitations match; other guests unchanged                                             | US1            |
| 3   | Through `scripts/guest-api-smoke.ts`, request a magic link for a seeded household email, then for an unknown email | Same on-screen message both times; only the seeded address receives a link (local mail catcher) | US2, R2        |
| 4   | Sign in as household A; read household B's rows (direct table reads and RPC with B's ids)                          | Nothing returned or `forbidden`                                                                 | SC-003         |
| 5   | As A, answer all events, pick dishes, add a nut allergy, save, sign out, return                                    | Answers and choices persist; conflict flag appears for a dish tagged with nuts                  | US2, US3       |
| 6   | Set one event deadline in the past; try to change that answer as a guest, then as staff                            | Guest refused (`rsvp_closed`); staff succeeds                                                   | US2            |
| 7   | Household answered required events but not the welcome party; send "RSVP reminder" to unanswered required events   | Household not included; "optional events reminder" for the welcome party includes it            | US4, FR-029    |
| 8   | Send a reminder to non-responders twice (call the send route twice)                                                | Each reachable household has exactly one message; second call changes nothing                   | US5, SC-004    |
| 9   | POST a signed `email.delivered`, then an earlier `email.sent`, then `email.delivered` again                        | Status ends `delivered`; duplicate ignored; no regression                                       | FR-022         |
| 10  | POST `email.bounced` for a message                                                                                 | Message `bounced`; household `delivery_problem` set; visible to staff                           | US5            |
| 11  | Archive a dish that two guests chose                                                                               | Both listed; selections moved to history; dish absent from totals                               | FR-038         |
| 12  | As the planner: edit an RSVP, send a campaign; then try to delete a couple row in `staff`                          | First two succeed and are attributed to the planner; delete refused                             | US7            |
| 13  | Revoke the planner, then make any request as them                                                                  | Refused on the next request                                                                     | FR-041         |
| 14  | Compare the event-count view and the caterer export to a manual count of seeded answers                            | Identical                                                                                       | SC-005, SC-009 |
| 15  | Run the whole guest flow with `scripts/guest-api-smoke.ts` and no screens present                                  | Sign-in, read, save, plus-one, and deadline error all work using only `docs/guest-api.md`       | US8, SC-007    |

## Automated checks

```bash
npm run format:check && npm run lint && npm run type-check && npm test
npx supabase test db     # pgTAP: schema, RLS, RPC, views
```

The pgTAP suite must prove, per table, what **anon**, **guest**, and **staff** can and cannot do (Constitution II), including the cross-household cases in scenario 4 and the planner restrictions in scenario 12.

## Validation run (local stack)

All fifteen scenarios were run end to end against the local stack: `npm run dev`, the scripts in `scripts/`, Mailpit at `127.0.0.1:54324`, signed webhook payloads, and `curl`/`psql`. The server environment came from `npx supabase status -o env` plus the server-only variables in a file kept outside the repository.

| #   | Result | Notes                                                                                                                                                                                                                                                                                                                                   |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pass   | The shipped sample file has no bad row, so a copy with three extra households was used (invalid email, a guest with no name, one good). Bad rows reported with row, field, reason; no partial household. Importing the sample twice creates a second paper-only household (no email to match on); `find_duplicate_households` flags it. |
| 2   | Pass   | `invite` added two rehearsal invitations, left all other invitations unchanged, sent no messages, and reported existing ones on repeat.                                                                                                                                                                                                 |
| 3   | Pass   | After the fixes below. Only the seeded address received a link.                                                                                                                                                                                                                                                                         |
| 4   | Pass   | Direct table reads, update attempts, and RPC calls with another household's ids returned nothing or `forbidden`.                                                                                                                                                                                                                        |
| 5   | Pass   | Answers, meals, allergy, and message persisted across sign-out and sign-in. The conflict view (staff only) listed the nut allergy against the nut-tagged dish.                                                                                                                                                                          |
| 6   | Pass   | Guest change refused with `rsvp_closed`; resending an unchanged answer and adding a dietary note after the deadline allowed; staff change succeeded.                                                                                                                                                                                    |
| 7   | Pass   | Required-events reminder excluded the household that still owed the welcome party; the optional-events reminder included it. Paper-only households were skipped with `no_email`.                                                                                                                                                        |
| 8   | Pass   | One message per reachable household; the second call returned `409 campaign_not_sendable` and changed nothing; the scheduled-send route ran a due campaign once and did nothing on repeat.                                                                                                                                              |
| 9   | Pass   | Bad signature `400`; delivered, then an earlier sent, then a duplicate and a repeat: status stayed `delivered`.                                                                                                                                                                                                                         |
| 10  | Pass   | Bounce set the message `bounced` and the household `delivery_problem`, visible to staff and selectable as an audience; a later delivered event did not regress it.                                                                                                                                                                      |
| 11  | Pass   | Both guests listed by `archive_dish`; selections moved to history with reason `dish_archived`; dish absent from totals; archiving twice returns nothing.                                                                                                                                                                                |
| 12  | Pass   | Planner's RSVP edit and campaign creation attributed to the planner in the audit log; deleting or editing the couple row refused; staff-access endpoints `403`.                                                                                                                                                                         |
| 13  | Pass   | After the couple revoked the planner, the planner's existing session got `403` on admin and guest endpoints, and direct reads and RPCs returned nothing or `forbidden`. The last couple member cannot be removed.                                                                                                                       |
| 14  | Pass   | Event counts, the guests and responses exports, and the caterer export (dish totals, not-yet-chosen, restrictions, conflicts) matched a manual `psql` count. Formula-looking cells are prefixed with an apostrophe.                                                                                                                     |
| 15  | Pass   | `scripts/guest-api-smoke.ts` passed every step (sign-in, read, save, plus-one, opt-out, deadline error, sign-out) with no screens present.                                                                                                                                                                                              |

### How scenarios 7 to 10 were run without live sends

No real templates exist, so the run registered a throwaway fixture template for the reminder types in `emails/index.ts` (reverted afterwards) and pointed the Resend SDK at a local stand-in with `RESEND_BASE_URL`, which also honoured the idempotency key. Nothing was sent through Resend.

### Deviations found and fixed

- **Redirect allow-list.** `.env.example` suggests `http://localhost:3000`, but `supabase/config.toml` only allowed `https://127.0.0.1:3000`, so the emailed link fell back to the site URL and sign-in failed. The local allow-list now lists the callback on both `localhost` and `127.0.0.1`.
- **Smoke script cookies.** The unknown-address sign-in overwrote the known address's code-verifier cookie, so sign-in never completed. The unknown address now uses its own cookie jar.
- **Smoke script deadline step.** It resent the stored answer, which the API allows after a deadline, so it reported a failure. It now asks for the opposite of the stored answer.
- **Seed ids rejected.** Validation used strict UUID versions, so the readable seed ids (for example for courses, dishes, and staff) got `422` even though the database accepts them. API validation now accepts any uuid-shaped id.

### Notes and deferred items

- **Deferred: live Resend.** Sending with a real key, delivery of real webhooks, and domain verification need the real account and templates (see `docs/manual-setup.md`). The Send Email hook route was checked with a signed payload (`401` for a bad signature, `500 template_missing` with no template); the hook stays off locally.
- **Campaign sends are logged as system.** Creating a campaign is attributed to the staff member, but the send itself runs with the service role, so its status changes appear in the audit log as `system`.
- **Revoked staff keep a sign-in account.** A revoked planner can still request a link, but every staff request is refused.
- **Sign-in rate limit.** Sign-in allows five requests a minute per client IP address, so scripted runs that sign in repeatedly need short pauses.
