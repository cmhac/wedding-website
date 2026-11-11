# Contract: guest API changes

Changes to [`specs/001-guest-data-model/contracts/guest-api.md`](../../001-guest-data-model/contracts/guest-api.md) and the sign-in section of [`specs/004-placeholder-homepage/contracts/home-and-sign-in.md`](../../004-placeholder-homepage/contracts/home-and-sign-in.md). "Texting available" means the provider is configured and the couple's switch is on. While it is not available, every text feature below behaves as if it did not exist.

## `POST /api/guest/sign-in` (changed)

Request, JSON: `{ "identifier": "<email address or phone number>", "sms_consent": true }`. `sms_consent` is optional and only meaningful for a phone number. The old body `{ "email": "..." }` is still accepted as an alias for `identifier`. Invalid shape: `422 invalid_payload`; per-IP limit: `429 rate_limited` (both as before).

Always `202`, after at least 1.5 seconds, with the same body whatever happened:

```json
{
  "message": "If that email address or mobile number is on the guest list, or belongs to a staff account, a link is on its way."
}
```

| Typed value                                                           | What the server does                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contains `@`                                                          | The existing email path (household address: the site emails a link; otherwise a staff link is requested). Unchanged.                                                                              |
| A phone number, texting available, `sms_consent` true, on a household | Applies the sign-in limits, records the opt-in for that number (source `sign_in_prompt`), texts a **confirmation** if the opt-in is new, then texts a **timed sign-in link** to that number only. |
| A phone number, any other case                                        | Nothing is sent and nothing is recorded: unknown, not on a household, non-US, `sms_consent` missing or false, over a limit, texting not available.                                                |
| Anything else                                                         | Nothing is sent.                                                                                                                                                                                  |

Logs hold an outcome code only, never the number.

## `GET /t/[token]` (new)

The timed sign-in link in a text: `/t/<household id>.<expiry>.<signature>`. Valid for 15 minutes from sending, reusable in that window, ended early by reissuing the household's link or "sign out everywhere". Opening it signs the household in on that device and redirects `302` to the guest landing path (`GUEST_RSVP_PATH`, default `/`). Every failure (malformed, bad signature, expired, superseded) is a `302` to `/auth/error` with no detail, `Cache-Control: no-store`, `X-Robots-Tag: noindex`, as for the personal link. It does not depend on the wedding-day cutoff. With texting not available it fails like any bad link (it can only exist if texts were once sent).

## `GET /api/guest/sms-consent` (new)

Signed-in guest. `200`:

```json
{
  "available": true,
  "pending": [{ "id": "<contact id>", "masked": "(•••) •••-0123" }]
}
```

`pending` lists the household's phone numbers still `not_asked`. With texting not available: `{ "available": false, "pending": [] }`. `401` not signed in, `403` staff or no household.

## `POST /api/guest/sms-consent` (new)

Signed-in guest. Request: `{ "answers": [{ "id": "<contact id>", "opt_in": true }] }`, at most 10 answers. Records each answer (ticked → opted in, unticked → declined; a number already answered is left as it is), then texts one confirmation for each number newly opted in. `200 { "saved": <count> }`. `409 texting_unavailable` while texting is not available. `403 not_a_guest`, `422 invalid_payload`, `401` as usual. Another household's id is treated as not found and changes nothing.

## `GET /api/guest/rsvp` contacts (changed)

`contacts` additionally lists phone numbers masked as `(•••) •••-0123`, as `{ "kind": "phone", "masked": "..." }`, only while texting is available. Email entries are unchanged.

## The consent statement (shown with every consent checkbox)

Same text at both opt-in points, unticked checkbox, separate from any agreement to the privacy and terms pages: "By ticking a box you agree to receive text messages from Chris & Hannah's wedding about our wedding (reminders, essential updates and sign-in links), about a dozen messages over six months. Msg & data rates may apply. Reply HELP for help, STOP to opt out." plus links to `/privacy` and `/terms`. Texts are optional and email always works. This wording matches what is registered with the carriers; change both together.
