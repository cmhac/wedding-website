# Contract: admin API and console changes

Changes to [`specs/001-guest-data-model/contracts/admin-api.md`](../../001-guest-data-model/contracts/admin-api.md). "Texting available" and "configured" are as in the spec: configured = the provider's settings are on the server; available = configured and the couple's switch on.

## Visibility rules for the console

| State                             | Banner              | Phone fields, columns, channel choice, text counts, opt-in and delivery for texts | Switch     |
| --------------------------------- | ------------------- | --------------------------------------------------------------------------------- | ---------- |
| Not configured                    | Shown on every page | Hidden                                                                            | Hidden     |
| Configured, switch off            | Not shown           | Shown                                                                             | Shown, off |
| Configured, switch on (available) | Not shown           | Shown                                                                             | Shown, on  |

The banner (a `role="status"` paragraph above every page's heading): "Text messaging is not set up. Texts are off. Sign-in and invitations by email still work. See the setup instructions in docs/manual-setup.md." It appears for the couple and the planner and never on a guest screen.

## Household contacts

- Staff add, change and remove a phone number through new routes under `/api/admin` (and the console's forms), which validate it as a United States number and store it as E.164: `POST /api/admin/households/{id}/phones`, `PATCH` and `DELETE /api/admin/households/{id}/phones/{contactId}`. Errors: `422 invalid_phone` (not a valid number), `422 not_us_phone` (outside the United States), `409 phone_in_use` (belongs to another household), `409 texting_not_configured` (the provider is not configured; nothing is saved). Adding or changing a number sets its opt-in to "not asked".
- Direct table writes to phone contacts are refused by row-level security. Direct reads work: staff can read `household_contacts` including `sms_consent`, `sms_consent_at`, `sms_consent_source`. No route and no column grant lets staff set `opted_in`.
- The household list and detail show email count, phone count (only when configured), each number's opt-in state (not asked, opted in, declined), and "paper only" when a household has neither. A household whose only contact is a phone number while texting is not available is shown as "reachable by neither channel".

## Import

New columns `contact_phone`, `contact_phone_2`, `contact_phone_3`, ... Same per-row, per-column errors as email: `Not a valid phone number`, `Only United States numbers are supported`, `Repeated in this file`, `Already used by another household`. Phones never carry a consent value. Not configured: phone columns are dropped before validating, nothing from them is saved, and the result says "Phone numbers were ignored because texting is not set up" with a count. Configured: saved whether or not the switch is on.

## Campaigns

- `campaigns.channel`: `email` (default), `text` or `both`; chosen on the new-campaign form only when configured; locked after sending.
- Choosing `text` or `both` for a message type with no registered text wording (the invitation, the save the date) is refused: `422 template_missing` naming the type, nothing queued.
- Preview, per household: emails to send, texts to send, and for every skipped number or household the reason in plain words: paper only; no contact on the chosen channel; not opted in; declined; reminders opted out; texting switched off; already responded. Totals per channel. With text chosen and the switch off: "Texting is switched off: texts will be skipped."
- Sending: emails exactly as today. Texts: only to opted-in numbers, paced at one every 2 seconds, resumed by the scheduled run (research R11). A campaign stays `sending` until nothing is queued.

## Delivery, reports and the switch

- Delivery views and reports gain a text column per number: latest status and a plain-English reason for a failure (research R10's list; unknown codes show "Twilio error NNNNN"; `unknown_outcome` shows "Sent but not confirmed: check Twilio before re-sending").
- A failed text flags the number and its household, counted with the existing delivery problems; the flag clears when the number is changed or removed.
- Settings (couple only): "Text messaging" with the on/off switch (`settings.sms_enabled`), shown only when configured, with the current state in words. Turning it on does not text anyone: guests see the consent step at their next sign-in.
