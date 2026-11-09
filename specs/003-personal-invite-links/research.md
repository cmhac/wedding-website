# Research: Personal invite links and shared household sign-in

Each item records the decision, why, and what else was considered. Items marked **verify first** are confirmed by the first test that exercises them (see `quickstart.md`); if one fails, the fallback named in the item is used and this file is updated.

## R1. Who owns sign-in: Supabase Auth plus a thin household layer

- **Decision**: Supabase Auth stays the sign-in system: one Auth user per household, Supabase-issued single-use sign-in tokens, Supabase sessions and cookies, and row-level security keyed on `auth.uid()`. The site adds a layer that maps a personal link or a typed email address to a household, asks Supabase for a sign-in token for that household's Auth user with `auth.admin.generateLink` (which creates a link without sending anything: [generateLink](https://supabase.com/docs/reference/python/auth-admin-generatelink)), and exchanges it for a session on the server with `verifyOtp({ token_hash, type })` ([verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)).
- **Rationale**: keeps session security, refresh and revocation in Supabase; the custom code only decides which household a request belongs to. Matches the constitution's "magic-link sign-in for everyone".
- **Alternatives**: a fully custom session system (rejected: re-implements security-critical code); Supabase's own email sign-in per address (rejected: a Supabase user holds one email, and a household now has several).
- **Verify first**: the `type` passed to `verifyOtp` for a token from `generateLink({ type: 'magiclink' })`. Supabase's reference lists `magiclink` as deprecated for email in favour of `email`. Use `email`; fall back to `magiclink` if the local test fails.
- **Outcome (2026-11-09, local Supabase)**: confirmed. `generateLink({ type: "magiclink" })` returns `properties.hashed_token`, and `verifyOtp({ token_hash, type: "email" })` returns a session for the household's user. Use `email`. The check is `src/lib/auth/__tests__/verify-first.test.ts`.

## R2. The household's Auth user has a synthetic, never-mailed email

- **Decision**: each household's Auth user gets a synthetic address `household-<household id>@<HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN>`, default domain `households.invalid` (the `.invalid` top-level domain is reserved and never routes mail). Real guest addresses live only in the new `household_contacts` table. Contact changes never touch Auth.
- **Rationale**: a household has several addresses, and Supabase allows one per user; tying the user to any one real address would make removing that address delete or rename the account. Keeping real addresses out of `auth.users` also means Supabase can never email a guest directly.
- **Alternatives**: one Auth user per address (rejected: breaks "one shared account per household" and multiplies row-level-security joins); keeping the first address on the Auth user (rejected: the coupling above).
- **Verify first**: Supabase accepts a `.invalid` address in `auth.admin.createUser`. Fallback: a subdomain of the site with no mail records, set through `HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN`.
- **Outcome (2026-11-09, local Supabase)**: confirmed. `auth.admin.createUser({ email: "household-<uuid>@households.invalid", email_confirm: true })` succeeds, so the default domain stays `households.invalid`. The check is `src/lib/auth/__tests__/verify-first.test.ts`. It runs against the local stack only; hosted Supabase is checked again at the first production household.
- **Existing data**: production has no households yet, so no Auth users need renaming. A household created before this change is converted by `scripts/convert-household-accounts.ts` (renames the Auth user's email; idempotent), run once if any exist.

## R3. Personal invite links are derived, not stored

- **Decision**: the link is `/i/<token>`, where `<token>` is the household id (base64url, 22 characters) followed by `.` and an HMAC-SHA256 (base64url, 43 characters) of `household id : link version` keyed with a new server-only secret `INVITE_LINK_SECRET`. The database stores only `households.invite_link_version` (integer) and `invite_link_issued_at`. Reissuing increments the version, which invalidates the old token at once.
- **Rationale**: campaigns must put the same working link in every email, and staff must be able to copy it, so a one-way hash of a random token (which cannot be shown again) does not fit. Deriving the token means nothing secret is in the database (FR-006: a database leak does not reveal working links) and nothing personal is in the link (the household id is a random UUID).
- **Alternatives**: random token stored as a hash (rejected: cannot be re-sent or copied); random token stored encrypted (rejected: more moving parts for the same result); a signed JWT with an expiry (rejected: cannot be revoked without a version check anyway).
- **Checks on open**: constant-time compare of the HMAC; household exists and has an Auth user; links are open (R6). Every failure redirects to the one failure path, `/auth/error`, with no detail.

## R4. Opening a personal link

- **Decision**: `GET /i/[token]` (a route handler, no screen) validates the token (R3), calls `generateLink` for the household's Auth user, calls `verifyOtp` with the server Supabase client so the session cookies are set on the response, and redirects to the RSVP path (`GUEST_RSVP_PATH`, default `/rsvp`). Responses are `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- **Rationale**: one tap from the email to the RSVP (SC-001). The link is not used up, so it works on any number of devices (FR-004); each open creates an independent session.
- **Link scanners**: some mail systems open links to scan them. A personal link survives that (opening creates a throwaway session and does not consume the link).
- **Alternatives**: redirecting the guest through Supabase's own `/auth/v1/verify` URL (rejected: adds a hop to Supabase's domain for no gain).

## R5. Typed-address sign-in links

- **Decision**: `POST /api/guest/sign-in` keeps its request, neutral `202` answer and minimum duration. For a known address (looked up in `household_contacts` with the service-role client) it calls `generateLink` for the household's Auth user, builds `${NEXT_PUBLIC_SITE_URL}/auth/confirm?token_hash=…&type=email`, renders the registered `magic_link` template with `audience: "guest"`, and sends it through Resend to the address typed. `GET /auth/confirm` exchanges the token with `verifyOtp` and redirects like R4. Supabase's own email sending is no longer used for guests.
- **Rationale**: the address typed is the one the link goes to (FR-012), whichever of the household's addresses it is. Token expiry and single use stay Supabase's (`mailer_otp_exp`, one hour by default per the [CLI config reference](https://supabase.com/docs/reference/cli/config-reference)).
- **Known limitation**: a link scanner that opens a short-lived link before the guest does uses it up; the guest then asks again or uses the personal link. This is the same behaviour as today's Supabase links. A later guest frontend can add a "Continue" confirmation page that submits the token instead; the contract allows it (`POST /auth/confirm` with the same fields).
- **Staff sign-in is unchanged**: `signInWithOtp` with `shouldCreateUser: false`, sent by Supabase, which calls the Send Email hook once it is on (R9).

## R6. Wedding-day cut-off

- **Decision**: new `settings.wedding_event_id` (references `events`, `on delete set null`). Personal links are open while the current date in `America/Los_Angeles` is before that event's start date in the same time zone; a database function `invite_links_open()` answers that. With no wedding event chosen, links stay open and the admin overview shows a warning. Typed-address sign-in and existing sessions are not affected (FR-009).
- **Rationale**: the spec ties the cut-off to the wedding event so moving the event moves it. Picking the event explicitly avoids guessing which event is "the wedding" from names or order.
- **Alternatives**: a separate `wedding_date` setting (rejected: could drift from the event); inferring from the last required event (rejected: fragile).

## R7. Several email addresses per household

- **Decision**: new table `household_contacts` (one row per address, `kind` limited to `email` for now, unique address across all households, case-insensitive). The data from `households.contact_email` moves into it in the migration, and the column is dropped. `households.delivery_problem` stays as a staff-only column, now maintained by a trigger as "any of this household's contacts has a delivery problem".
- **Rationale**: FR-001 to FR-003; the `kind` column lets the deferred text-message feature add phone numbers without reworking the table.
- **Alternatives**: keep `contact_email` as a "primary" plus an extra-addresses table (rejected: two places for the same fact, and every reader would need both); an array column (rejected: no per-address uniqueness or delivery flag).
- **Impact**: `contact_email` is referenced by about 15 source files and 24 database test files. All change in this feature; the tests change first (constitution principle I).
- **Staff addresses**: a trigger refuses a contact whose address belongs to a staff account, and granting staff access refuses an address that is a household contact (FR-013).

## R8. Campaign messages per address

- **Decision**: `messages` gains `contact_id` (references `household_contacts`, `on delete set null`). The uniqueness rule becomes one row per campaign, household and contact (`unique nulls not distinct`), so a skipped household still has one row with no contact. Enqueueing expands each deliverable household to one row per current contact; claiming re-reads the contact and skips with `no_email` if it was removed meanwhile. `record_message_event` flags the contact (and through the trigger, the household).
- **Rationale**: FR-020 to FR-023 and SC-006 (exactly one email per address, also on retry).
- **Alternatives**: one message row per household with several recipients (rejected: delivery status is per address).

## R9. Templates and the Send Email hook

- **Decision**: this feature registers first-draft, plain templates in `emails/` for `magic_link`, `invitation` and `rsvp_reminder`, written with `@react-email/components` (already a dependency), by the couple's permission recorded in `CLAUDE.md`. Campaign props gain `personal_link` (the household's `/i/<token>` URL); `rsvp_url` stays for templates that want the plain site link.
- **Hook switch-over** (operations, recorded in `docs/manual-setup.md`): deploy with `magic_link` registered; set `SEND_EMAIL_HOOK_SECRET` in Vercel; turn the hook on in Supabase; sign in to the admin console to prove a staff email arrives through the hook; only then remove the custom SMTP settings (FR-026). After this feature, the hook only ever sends staff sign-in emails, because guests' links are sent by the site (R5).

## R10. "Sign out everywhere"

- **Decision**: a security-definer function `revoke_household_sessions(household_id)`, callable only by the service role, deletes the household Auth user's rows from `auth.sessions` (refresh tokens go with them). Guest access additionally requires the caller's session to still exist: `current_household_id()` and the guest read policy check that `auth.jwt() ->> 'session_id'` is a row in `auth.sessions`. Supabase lists `session_id` as a standard access-token claim ([JWT fields](https://supabase.com/docs/guides/auth/jwt-fields)).
- **Rationale**: takes effect on the next request, not when the access token expires. Supabase's `auth.admin.signOut` needs one of the user's own access tokens, which the server does not have for other devices.
- **Alternatives**: deleting and recreating the household's Auth user (rejected: `invitations.responded_by` and `meal_selections.chosen_by` reference Auth users with `on delete set null`, so it would erase who answered); waiting for access tokens to expire (rejected: up to an hour of access after "sign out everywhere").
- **Verify first**: deleting from `auth.sessions` also removes the refresh tokens, and a deleted session's access token is refused by the guest policy (pgTAP and a route test).
- **Outcome (2026-11-09, local Supabase), first half**: confirmed. Deleting a user's `auth.sessions` rows also removes their `auth.refresh_tokens` rows and leaves other users' alone (`supabase/tests/database/170-household-sessions.test.sql`). The second half (a deleted session's access token refused by the guest policy) is tested with the sign-out-everywhere work.

## R11. Staying signed in indefinitely

- **Decision**: rely on Supabase's default: sessions refresh themselves and end only if a maximum lifetime or inactivity timeout is set ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)). The quickstart checks through the Management API that both are unset in production, and `docs/manual-setup.md` says to keep them unset.
- **Note**: staff sessions are affected the same way; that matches today.

## R12. Limits on sign-in requests

- **Decision**: a durable limiter in the database replaces reliance on Supabase's per-email limit, which no longer applies to guests (no Supabase email is sent). New table `sign_in_attempts` (a SHA-256 hash of the normalised address keyed with `INVITE_LINK_SECRET`, and a timestamp); the function `allow_sign_in_attempt(address_hash)` counts attempts per address and overall within windows set in `settings` (defaults: 3 per address per 10 minutes, 60 overall per hour), records the attempt, and returns allowed or not. The existing in-memory per-IP limiter stays in front. Rows older than a day are deleted by the existing cron schedule.
- **Rationale**: FR-015 (limits settable without code changes) and the move away from Supabase's limit; in-memory limits reset per serverless instance, as `docs/manual-setup.md` already warns.
- **Alternatives**: in-memory only (rejected: not durable); an external rate-limit service (rejected: new dependency for a small site).

## R13. Shared editing and what guests see

- **Decision**: any session linked to the household can call the existing RSVP functions; they already run in one transaction per save and write the change history per field, so concurrent saves leave a consistent state (last save wins per field). `GET /api/guest/rsvp` gains `contacts` (the household's addresses, masked as `c•••@example.com`) and `deadline_passed` (true when every event's effective deadline has passed or RSVPs are closed).
- **Rationale**: FR-003 lets guests see their household's addresses; masking limits what a forwarded link exposes. The frontend words the deadline notice; the API only says it applies (FR-005).

## R14. Decision records

- **Decision**: two new decision records supersede earlier ones, each linking back: guest identity (one shared Auth user per household with a synthetic address, personal invite links, typed-address links sent by the site) supersedes the guest-identity decision (`0003`); shared household access (several addresses, any signed-in member answers) supersedes the household decision's "exactly one responder" (`0006`, the rest of which stands). The auth-emails decision (`0004`) gets a dated note that the hook now carries staff email only.
