# Contract: Twilio delivery notifications

`POST /api/webhooks/twilio`, called by Twilio (the status callback set on each message).

| Aspect          | Behavior                                                                                                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body            | `application/x-www-form-urlencoded`; the fields used are `MessageSid`, `MessageStatus`, `ErrorCode`. All posted fields are passed to the signature check.                                                                                                                  |
| Signature       | `X-Twilio-Signature` checked with the Twilio library over the auth token, the public URL (`NEXT_PUBLIC_SITE_URL` + `/api/webhooks/twilio`, built by the site, not read from the request) and every parameter. Missing or wrong: `403 invalid_signature`, nothing recorded. |
| Not configured  | `200`, nothing recorded, nothing checked (the provider cannot be calling).                                                                                                                                                                                                 |
| Statuses        | `queued`, `sending` → `sending`; `sent` → `sent`; `delivered` → `delivered`; `undelivered`, `failed` → `failed` with `ErrorCode` and the contact flagged. Others (for example `read`) are ignored with `200`.                                                              |
| Idempotency     | Event key `<MessageSid>:<MessageStatus>`; a repeat is a no-op. A late earlier status never moves a message backwards (same ranking as email).                                                                                                                              |
| Unknown message | `200`, ignored (for example a sign-in or confirmation text, which are not campaign rows).                                                                                                                                                                                  |
| Failure to save | `500` so Twilio retries.                                                                                                                                                                                                                                                   |
| Logging         | Outcome code and status only; never the number or the message body.                                                                                                                                                                                                        |

Sign-in and confirmation texts are sent with the same status callback, but they have no `messages` row, so their notifications are acknowledged and dropped.
