# Contract: HTTP endpoints (Next.js route handlers)

All handlers run on the server, read secrets only from server environment variables, validate input with zod, and never log request bodies, emails, names, or addresses (log ids and outcome codes only).

| Method and path                         | Caller                            | Auth                                                   | Purpose                                                              |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `POST /api/auth/send-email`             | Supabase Auth ("Send Email" hook) | Standard Webhooks signature (`SEND_EMAIL_HOOK_SECRET`) | Renders the registered `magic_link` template and sends it via Resend |
| `POST /api/webhooks/resend`             | Resend                            | Svix signature (`RESEND_WEBHOOK_SECRET`)               | Records delivery events                                              |
| `POST /api/admin/campaigns/[id]/send`   | Admin frontend                    | Signed-in staff session                                | Send a draft campaign now                                            |
| `POST /api/internal/dispatch-scheduled` | `pg_cron` via `pg_net`            | `Authorization: Bearer CRON_SECRET`                    | Send campaigns that are due                                          |
| `POST /api/admin/guests/import`         | Admin frontend                    | Signed-in staff session                                | CSV import with per-row errors                                       |
| `GET /api/admin/exports/[kind]`         | Admin frontend                    | Signed-in staff session                                | `guests`, `responses`, `caterer` as CSV                              |

Admin sign-in, household, and staff-access endpoints are specified in [admin-api.md](./admin-api.md). Guest-facing endpoints (sign-in, RSVP, plus-one, opt-out) are specified in [guest-api.md](./guest-api.md) and use the RPCs in [database-rpc.md](./database-rpc.md).

## `POST /api/auth/send-email`

- Verify the Standard Webhooks signature over the **raw** body. Reject with 401 on failure, without a body that explains why.
- Payload is Supabase's hook payload (user email, token data, action type). Only `magiclink` is expected; other types return 200 with no send.
- Renders the registered `magic_link` template (see [email-templates.md](./email-templates.md)) and sends with Resend. A missing template returns `500 template_missing`. On Resend failure return 500 so Supabase surfaces an error to the sign-in action.
- Never echoes whether the address is a known guest. The sign-in endpoints (`POST /api/guest/sign-in` and the staff sign-in) return one neutral message either way.

## `POST /api/webhooks/resend`

- Verify with the `resend` SDK's `webhooks.verify` using the raw body and the `svix-id`, `svix-timestamp`, `svix-signature` headers; 400 on failure. Older-than-five-minutes deliveries fail verification by design.
- Calls `record_message_event` with the `svix-id` as `provider_event_id`. Duplicate delivery returns 200 with no change.
- Unknown message ids (for example, an auth email not in `messages`) return 200 and are ignored.
- Handled types: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`; others return 200 and are ignored.

## `POST /api/admin/campaigns/[id]/send`

1. Require a staff session; load the campaign (must be `draft`, `scheduled`, or `sending`; otherwise 409. A campaign left `sending` by a crash is resumed: claiming and idempotency keys make that safe).
2. Resolve the template for the campaign's message type; if none is registered, return `409 template_missing` before creating any message row (see [email-templates.md](./email-templates.md)). Call `resolve_audience`, insert one `messages` row per household (`queued`, or `skipped` with a reason for households with no email, opted-out for non-essential types, or filtered out), using the unique constraint to make a retry a no-op.
3. Set the campaign `sending`; claim messages in batches with `claim_campaign_messages`, which resolves each household's current `contact_email` into `messages.to_email` (a household whose email was cleared meanwhile becomes `skipped` with `no_email`); send each through Resend with `Idempotency-Key = message.id`; record `sent` and `provider_message_id`, or `failed` with an error code.
4. When no `queued` messages remain, set `done` and `completed_at`.
5. Response: `{ campaign_id, queued, sent, skipped: { no_email, opted_out, other }, failed }`. The skipped-with-no-email count lets the admin interface list households needing a paper invitation (spec User Story 5, scenario 4).

Retrying the same request is safe at every step. Non-essential message types exclude opted-out households; `is_essential` types ignore the opt-out (FR-021).

## `POST /api/internal/dispatch-scheduled`

- Constant-time compare of the bearer token with `CRON_SECRET`; 401 otherwise.
- Runs the same send procedure for each campaign from `due_scheduled_campaigns()` and for any campaign left in `sending` by a crash, then updates `settings.last_dispatch_at`. A campaign whose template is missing stays `scheduled` with `campaigns.last_error_code = 'template_missing'`, and the others still run.
- Called every 5 minutes by `pg_cron`; a missed run delays a send by at most one interval and a repeated run changes nothing.

## `POST /api/admin/guests/import`

- Accepts a CSV (one row per guest; household columns repeated per row or keyed by a `household_ref`), plus optional event-slug columns for invitations.
- Parses and validates (zod), then calls `import_households`. Response: `{ created: { households, guests, invitations }, errors: [{ row, field, message }] }`. A household with any invalid row is not created (no partial households).

## `GET /api/admin/exports/[kind]`

- `guests`: one row per guest per event: household, guest, event, status, dietary categories and notes.
- `responses`: one row per guest per event with status, responded_at, and chosen dishes.
- `caterer`: per event, per course, per dish totals, plus the restrictions list (attending guests only, with severity and notes) and any `meal_conflicts`.
- CSV with a header row, spreadsheet-safe quoting (cells starting with `=`, `+`, `-`, or `@` are prefixed to prevent formula injection). Staff only.
