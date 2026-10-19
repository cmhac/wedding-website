# Research: Guest, Invitation, and Communication Data Model

Resolves every open decision in `docs/architecture.md` that this feature depends on. Each is also written up as a record in `docs/decisions/` with status "accepted" (confirmed by the couple on 2026-10-19). External claims were checked against the sources linked; where only secondary sources were found, that is stated.

## R1. Hosting

- **Decision**: Run the Next.js app on a host that executes Next.js server code (Vercel is the default recommendation). Do not set `output: "export"`.
- **Rationale**: Guest sign-in uses server-side auth cookies, route handlers receive webhooks, and sends run server-side. A static export (as on GitHub Pages) cannot do any of that.
- **Alternatives**: GitHub Pages static export (rejected: no server code); self-hosted Node (rejected: more upkeep for a one-off site).
- **Open item**: the couple pick the host. The choice does not change the schema. It only needs the host to support Node 26 (see `0001-toolchain-versions.md`) and to hold the env vars in [quickstart.md](./quickstart.md).

## R2. Guest identity model

- **Decision**: Pre-create one Supabase Auth user per household (the responder, using the household contact email) from server code with the service-role key, and link it as `households.auth_user_id`. Guests sign in with `signInWithOtp` and `shouldCreateUser: false`. Turn off open sign-up in `config.toml`.
- **Rationale**: Matches the spec (one responder per household, FR-028). Open sign-up plus email matching would let anyone create an account and would put matching logic in the browser path. Supabase documents `shouldCreateUser: false` as the way to stop magic-link sign-in from creating accounts.
- **Caveat found in research**: with `shouldCreateUser: false`, an unregistered address returns an error, which can reveal whether an address is on the guest list. `POST /api/guest/sign-in` (and the staff sign-in) MUST return the same neutral message ("If that address is on the guest list, a link is on its way") regardless of outcome. Source for the error behaviour is a third-party write-up, so the plan includes a test against the real local stack.
- **Consequence for the spec**: two households cannot share one contact email, since one email maps to one Auth user. The spec's edge case is updated: the couple are warned on save and use a distinct address for one of them.
- **Alternatives**: open sign-up and match by email (rejected: account creation by strangers); signed per-household links with no Auth user (rejected: reinvents sessions and expiry; magic links also give a path to staff sign-in using the same mechanism).
- **Sources**: [signInWithOtp reference](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [email OTP guide](https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp), [third-party note on the unregistered-address error](https://www.guardlayer.io/blog/supabase-signups-not-allowed-for-otp).

## R3. Auth emails through Resend

- **Decision**: Use Supabase's "Send Email" auth hook over HTTPS, pointing at a Next.js route handler that verifies the hook signature and sends the magic-link email through Resend with a React Email template.
- **Rationale**: Magic-link emails then share the sending domain and template registry with campaign emails (content supplied separately), and bypass Supabase's built-in email rate limit (the local config notes that raising `email_sent` requires custom SMTP). Supabase's own guide shows this hook with Resend and React Email in an Edge Function; the hook accepts any HTTPS endpoint, so a Next.js route works the same way.
- **Alternatives**: custom SMTP in `[auth.email.smtp]` (valid and simpler, but the magic-link email would not go through the template registry); default Supabase sender (rejected: rate limited and unbranded).
- **Source**: [Supabase guide: custom auth emails with React Email and Resend](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend).

## R4. Where email sends run

- **Decision**: Next.js route handlers, not Supabase Edge Functions. "Send now" is a staff-only route. Scheduled sends are picked up by `pg_cron` calling a secret-protected route through `pg_net`, every 5 minutes.
- **Rationale**: Template modules supplied by others, the Resend client, and Jest tests all live in the Node runtime. Edge Functions run on Deno and would need the templates duplicated or bundled. Supabase documents `pg_cron` + `pg_net` as the way to call functions on a schedule, with the secret in Vault.
- **Risks noted**: `pg_cron`/`pg_net` jobs can fail silently, so the dispatch route is idempotent and `settings.last_dispatch_at` records the last run so the admin interface can report it; a missed run only delays a scheduled send by one interval.
- **Alternatives**: Edge Functions (rejected above); host cron (not chosen, since cron limits depend on the host plan, which was not verified).
- **Source**: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) (describes `pg_cron` with `pg_net`; the same call works for any HTTPS URL).

## R5. Idempotent sends

- **Decision**: One `messages` row per (campaign, household), enforced by a unique constraint, created before calling Resend. The row's id is passed to Resend as the idempotency key. The send claims rows with a status transition (`queued` → `sending` → `sent`) so concurrent or retried runs skip rows already claimed.
- **Rationale**: Satisfies FR-020 and SC-004 at two layers. Resend supports an `Idempotency-Key` on `POST /emails` and `/emails/batch`, remembers keys for 24 hours, and returns 409 if the same key is reused with a different payload. The database constraint covers retries after 24 hours.
- **Source**: [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

## R6. Delivery status via webhooks

- **Decision**: A Resend webhook route verifies the signature, stores each event once (keyed by the `svix-id`), and updates the message status only forward along a ranking (`queued < sent < delivered`; `bounced`, `complained`, `failed` are terminal and always win over `sent`/`delivered`).
- **Rationale**: Resend delivers webhooks at least once via Svix, with `svix-id`, `svix-timestamp`, and `svix-signature` headers computed over the raw body, and rejects deliveries older than five minutes. Verification must use the raw body. Event types include `email.sent`, `email.delivered`, `email.bounced`, `email.complained`.
- **Caveat**: Hookdeck guides, not Resend's own reference, were the source for the full event list; the plan relies only on the four named types. The tasks include checking Resend's current event reference when implementing the webhook.
- **Sources**: [Resend: verify webhook requests](https://resend.com/docs/webhooks/verify-webhooks-requests), [Hookdeck guide to Resend webhooks](https://hookdeck.com/webhooks/platforms/guide-to-resend-webhooks-features-and-best-practices.md).

## R7. Household and party model

- **Decision**: Household is the unit invited and emailed, with exactly one responder (the contact email). Guests belong to one household. Invitations are per guest per event. Plus-ones are placeholder guest rows (count = `plus_one_allowance`) the responder renames.
- **Rationale**: Matches the spec's assumptions and avoids a separate plus-one concept. A rehearsal-only guest, or one household with different event lists per person, needs no special cases.
- **Alternatives**: per-person sign-in (rejected by the couple: one adult per household); per-household invitations only (rejected: cannot express per-guest event lists).

## R8. Admin authorization

- **Decision**: A `staff` table (`user_id`, `role` in `couple` or `planner`). RLS uses a `SECURITY DEFINER` helper `is_staff()`. Couple and planner have the same data access; only `couple` rows can edit `staff`, which also prevents the planner from removing a couple member. Staff Auth users are created by script, not through sign-up.
- **Rationale**: The couple said the planner has full access. A role column still gives attribution (FR-042) and a protected revoke path (FR-041) with a single policy.
- **Alternatives**: custom JWT claims (rejected: stale until token refresh, which conflicts with "revocation takes effect on the next request"); a single shared admin account (rejected: no attribution).

## R9. Menus, restrictions, and conflict flags

- **Decision**: One lookup table `dietary_categories` serves both dish tags and guest restrictions. A category has a kind: `diet` (vegetarian, vegan, gluten-free, dairy-free, halal, kosher) or `allergen` (nuts, peanuts, shellfish, eggs, and so on). A dish tagged with a `diet` category means "suitable for"; tagged with an `allergen` category means "contains". A guest restriction conflicts with a chosen dish when the category is `diet` and the dish lacks the tag, or the category is `allergen` and the dish has the tag. A view exposes the conflicts.
- **Rationale**: One vocabulary, so the couple can add categories (spec assumption) without schema changes, and the conflict rule is a single readable view that is easy to test.
- **Limit**: tags are only as accurate as the couple's entry. The flag is a safety aid for the couple and caterer, not a guarantee, and the caterer export always includes the free-text restriction notes.

## R10. Retention, audit, and personal data

- **Decision**: No automatic deletion (couple's decision). Deleting a guest or household cascades personal rows and sets foreign keys to null in history tables, which hold no names or emails. The audit log stores actor, entity, action, and changed column names, never values.
- **Rationale**: Meets FR-026, FR-027, FR-042 and SC-006 without writing guest data to logs or leaving personal data in history.

## R11. Sending domain

- **Decision**: Verify one sending domain in Resend (DNS records) before any production send. Until then, development sends only to the Resend sandbox or are skipped. Recorded as a manual step in [quickstart.md](./quickstart.md).
- **Rationale**: Required by Resend for production sends; nothing in the schema depends on it.
