# Contract: text wording

Texts are registered in `texts/index.ts`, mirroring [`emails/`](../../001-guest-data-model/contracts/email-templates.md). A text template is a function from props to a plain string. The first-draft wording is written by this feature under the couple's standing permission and polished by Chris later; it MUST stay consistent with the sample texts registered with the carriers.

```ts
export type TextTemplate<P> = (props: P) => string;
```

| Key                        | Used for                           | Props                           |
| -------------------------- | ---------------------------------- | ------------------------------- |
| `sms_sign_in`              | the timed sign-in link             | `{ sign_in_url }`               |
| `sms_confirmation`         | the one text after an opt-in       | `{}`                            |
| `rsvp_reminder`            | RSVP reminder campaigns            | `{ personal_link, respond_by }` |
| `update`                   | essential update campaigns         | `{ personal_link, note }`       |
| `optional_events_reminder` | optional events reminder campaigns | `{ personal_link }`             |

No text is registered for `invitation` or `save_the_date`: the first contact is always an email, and choosing text for those types is refused before anything is queued.

## Rules enforced by tests

- Every text, rendered with realistic props (a site address of about 40 characters and a household link), is at most 160 characters and uses only the standard GSM-7 characters (no emoji, curly quotes or accented letters), so it is one segment.
- Every text names the couple's wedding site; the sign-in text, reminder and update include the link; the confirmation includes how often, "Msg & data rates may apply", "Reply HELP for help, STOP to opt out"; every other text includes "Reply STOP to opt out" or equivalent.
- No text contains a guest's name or any personal detail.
- A missing registry entry makes the send fail with `template_missing` (no text is sent), as for email.
