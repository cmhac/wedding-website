# Contract: home page and combined sign-in

## `GET /`

| Visitor                                                          | Response                                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Valid guest or staff session                                     | `200` HTML: the placeholder page. Body text is exactly "Coming soon 👀"; controls are the theme toggle and "Sign out". |
| No valid session (none, expired, signed out, staff role revoked) | `200` HTML: the sign-in prompt.                                                                                        |

Both responses: `robots` meta `noindex, nofollow`; not statically cached; no household, guest or staff data in the markup.

## `POST /api/guest/sign-in` (changed)

Request: `{ "email": "..." }` (unchanged). Always `202` after at least 1.5 seconds, with

```json
{
  "message": "If that address is on the guest list or belongs to a staff account, a link is on its way."
}
```

whether the address is a household address, a staff address, unknown, over a limit, or something failed. `429 rate_limited` (per-IP) and `422 invalid_payload` are unchanged.

- Household address: the existing household link is emailed to that address (opens `/auth/confirm`, lands on `/`).
- Staff address: the staff link is requested from Supabase and delivered through the Send Email hook (opens `/auth/callback?audience=staff`, lands on `/admin`).
- Anything else: nothing is sent.

## `POST /api/guest/sign-out` (changed)

`204`. Now ends only the calling device's session (local scope). Other devices of the same household stay signed in.

## Sign-in landings (changed)

`GET /i/[token]`, `GET /auth/confirm` and `GET /auth/callback` for a guest redirect to `/` (default; `GUEST_RSVP_PATH` still overrides). Staff via `/auth/callback` still go to `/admin`. Failures still go to `/auth/error`, which now links back to `/`.

## Admin console sidebar

First sidebar item (and first item in the phone drawer): an anchor to `/` with `target="_blank"` and `rel="noopener"`, labelled "View home page". Not present on the admin sign-in or error pages.
