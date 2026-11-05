# Quickstart: validating personal invite links and shared household sign-in

How to prove the feature works end to end. Shapes are in [contracts/](./contracts/) and the schema in [data-model.md](./data-model.md); this guide does not repeat them.

## Prerequisites

- Docker running, then `npm run db:start` and `npm run db:reset` (all migrations plus `seed.sql`, fake data only).
- `.env.local` from `.env.example`, including the new server-only `INVITE_LINK_SECRET` (any long random string locally) and, if needed, `HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN` (default `households.invalid`).
- Local email capture: Supabase's local mail viewer for staff links; for guest links the local Resend key is a test key, and the send helper's test double records messages in tests.

## 1. Fast checks (every change)

```bash
npm run format:check && npm run lint && npm run type-check && npm test
npm run test:db
```

Expected: all green. The database tests include the new files for `household_contacts` (uniqueness, staff-address refusal, guest can read only their own household's rows, no guest writes), `invite_links_open()` across the wedding-day boundary in `America/Los_Angeles`, `reissue_invite_link`, `revoke_household_sessions` plus the session check in `current_household_id()`, `allow_sign_in_attempt` limits, and per-contact `messages`.

## 2. "Verify first" items (research)

Run once at the start of implementation; record the outcome in `research.md`.

1. `auth.admin.createUser` accepts `household-<uuid>@households.invalid` (research R2). If refused, set `HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN` to a mail-less subdomain and re-run.
2. `generateLink({ type: "magiclink" })` followed by `verifyOtp({ token_hash, type: "email" })` on the server client sets session cookies (research R1). If refused, use `type: "magiclink"`.
3. Deleting a user's `auth.sessions` rows removes their refresh tokens, and an access token whose `session_id` no longer exists is refused by the guest read policy (research R10).

## 3. End-to-end scenarios (local, `npm run dev`)

Use the admin console at `/admin` as the couple seed account.

| Scenario                      | Steps                                                                                           | Expected                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Invitation link signs in      | Create a household with two fake addresses; copy its personal link; open it in a private window | Redirect to the RSVP path with a session; `GET /api/guest/rsvp` returns that household, `contacts` masked                      |
| Link works on a second device | Open the same link in another browser                                                           | Signed in there too; the first browser stays signed in                                                                         |
| Reissue                       | Click "Reissue link"; open the old link                                                         | Old link lands on `/auth/error`; new link signs in                                                                             |
| Sign out everywhere           | Click "Sign out everywhere"; reload `GET /api/guest/rsvp` in both browsers                      | `401` in both                                                                                                                  |
| Typed address                 | `POST /api/guest/sign-in` with the second address                                               | `202`; one email to that address, rendered from `magic_link` with `audience: "guest"`; its link signs in to the same household |
| Unknown address               | Same with an address on no household                                                            | Identical `202`, same timing, nothing sent                                                                                     |
| Limits                        | Request four links for one address within ten minutes                                           | Fourth gets the same `202`; no fourth email                                                                                    |
| Deadline passed               | Set the default RSVP deadline in the past; open the personal link                               | Signed in; `deadline_passed: true`; `PUT /api/guest/rsvp` returns `409 rsvp_closed`; staff can still record answers            |
| Wedding day                   | Choose the wedding event; set its start to today (Pacific time); open the personal link         | `/auth/error`; typed-address sign-in still works; an existing session still works                                              |
| Campaign per address          | Send an invitation campaign to a household with two addresses and a paper-only household        | Two emails (each with the personal link), one skipped `no_email` row; retrying sends nothing new                               |
| Bounce                        | Post a signed test `email.bounced` webhook for one address                                      | That address and the household are flagged; the other address is not; editing the address clears it                            |
| Staff address                 | Add a staff member's email as a household address                                               | Refused with `staff_account`                                                                                                   |
| Import                        | Import the sample file extended with `contact_email_2` values, one repeated                     | New addresses saved; the repeat reported by row and column                                                                     |

## 4. Production switch-over (after merge)

Follow `docs/manual-setup.md`; summary:

1. Set `INVITE_LINK_SECRET` (sensitive, production) in Vercel and redeploy.
2. Confirm session time-box and inactivity timeout are unset (Supabase Management API `GET /v1/projects/{ref}/config/auth`).
3. Set `SEND_EMAIL_HOOK_SECRET`, turn on the Send Email hook, and sign in to `/admin` once: the email must arrive rendered from the repository's `magic_link` template.
4. Only then remove the custom SMTP settings from Supabase Auth and record it.
5. Choose the wedding event in the admin console settings.
