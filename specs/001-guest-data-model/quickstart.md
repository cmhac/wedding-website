# Quickstart: Validate the data model end to end

A validation guide, not an implementation guide. The guest-facing screens belong to the designer, so guest scenarios run through the guest API (`scripts/guest-api-smoke.ts`) rather than a browser; only the admin area has screens here. It assumes the tasks in `tasks.md` are done. Contracts: [database-rpc.md](./contracts/database-rpc.md), [http-endpoints.md](./contracts/http-endpoints.md), [audience-filter.md](./contracts/audience-filter.md). Design: [data-model.md](./data-model.md).

## Prerequisites

- Node 26 (`nvm use`), Docker running, `npm install`
- `cp .env.example .env.local`, then fill in the values from `npm run db:start`
- New server-only variables (add names to `.env.example`, never real values):
  - `SEND_EMAIL_HOOK_SECRET` (Supabase auth hook)
  - `RESEND_WEBHOOK_SECRET` (Resend webhook)
  - `CRON_SECRET` (bearer for the scheduled dispatch route)
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
npm run email:dev                      # preview templates
```

## Validation scenarios

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
| 14  | Compare dashboard counts and the caterer export to a manual count of seeded answers                                | Identical                                                                                       | SC-005, SC-009 |
| 15  | Run the whole guest flow with `scripts/guest-api-smoke.ts` and no guest-facing screens present                     | Sign-in, read, save, plus-one, and deadline error all work using only `docs/guest-api.md`       | US8, SC-007    |

## Automated checks

```bash
npm run format:check && npm run lint && npm run type-check && npm test
npx supabase test db     # pgTAP: schema, RLS, RPC, views
```

The pgTAP suite must prove, per table, what **anon**, **guest**, and **staff** can and cannot do (Constitution II), including the cross-household cases in scenario 4 and the planner restrictions in scenario 12.
