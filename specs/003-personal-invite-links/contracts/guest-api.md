# Contract changes: Guest API

Changes to [`specs/001-guest-data-model/contracts/guest-api.md`](../../001-guest-data-model/contracts/guest-api.md). When implemented, that file and `docs/guest-api.md` are updated to match, and the contract test that compares the endpoint table with the route handlers on disk covers the new routes. This feature builds no screens.

## Endpoint table additions and changes

| Method and path           | Purpose                                                    | Success | Errors                                     |
| ------------------------- | ---------------------------------------------------------- | ------- | ------------------------------------------ |
| `GET /i/[token]`          | Open a personal invite link: sign in and go to the RSVP    | 302     | 302 to `/auth/error`                       |
| `GET /auth/confirm`       | Complete a typed-address sign-in link                      | 302     | 302 to `/auth/error`                       |
| `POST /auth/confirm`      | Same, for a frontend "Continue" page (form-encoded fields) | 302     | 302 to `/auth/error`                       |
| `POST /api/guest/sign-in` | Email a sign-in link to the address typed (changed)        | 202     | 422 invalid email format, 429 rate limited |
| `GET /api/guest/rsvp`     | Response gains `contacts` and `deadline_passed` (changed)  | 200     | unchanged                                  |

`GET /auth/callback` stays for staff sign-in links sent by Supabase.

## `GET /i/[token]`

- `token`: `<household id, base64url>.<signature, base64url>` (research R3). Never contains a name or address.
- Success: sets the Supabase session cookies and redirects `302` to the RSVP path (`GUEST_RSVP_PATH`, default `/rsvp`). An optional `next` query parameter is honoured only if it is a plain relative path under the RSVP path (same rule as `/auth/callback` today).
- Failure (malformed, wrong signature, superseded version, household gone, links closed for the wedding day, or any Supabase error): `302` to `/auth/error` with no query detail. All failures look the same.
- Headers: `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
- The link is reusable: each open creates an independent session on that device.
- A caller already signed in as a different household is signed in as the link's household (the new session replaces the old cookie on that device).

## `POST /api/guest/sign-in` (changed behaviour, same shape)

- Request `{ "email": "..." }`; response always `202` with `{ "message": "If that address is on the guest list, a link is on its way." }` after at least 1.5 seconds, as today.
- New: the address is looked up among all household addresses. For a known address within the limits (research R12), a link to `/auth/confirm` is emailed to **that address**, rendered from the `magic_link` template with `audience: "guest"`. Unknown address, limit reached, missing template, or send failure: same `202`, nothing sent, failure logged without the address.
- `429` stays only for the per-IP limiter in front, as today.

## `GET /auth/confirm` and `POST /auth/confirm`

- Fields: `token_hash` (required), `type` (`email`), optional `next` (same relative-path rule as above).
- Exchanges the token with Supabase (single use, expires per Supabase's email link setting), sets the session cookies, and redirects to the RSVP path. Staff accounts are redirected to `/admin` (a staff member never receives these links, but the rule matches `/auth/callback`).
- Failure: `302` to `/auth/error`.

## `GET /api/guest/rsvp` response additions

```json
{
  "contacts": [{ "kind": "email", "masked": "c•••@example.com" }],
  "deadline_passed": false
}
```

- `contacts`: the household's addresses, masked (first character, then `•••`, then the domain). Guests cannot change them (FR-003).
- `deadline_passed`: true when RSVPs are closed globally or every invited event's effective deadline has passed. The frontend shows the "deadline passed, contact the couple" notice; changes are refused with `409 rsvp_closed` as today.

## Rules (additions)

- Any session linked to the household may use every guest endpoint; there is no "responder" distinction any more.
- Guest access ends on the next request after staff use "sign out everywhere" for the household.
- `POST /api/guest/sign-out` ends only this device's session.
