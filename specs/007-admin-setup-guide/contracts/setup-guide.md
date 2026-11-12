# Contract: setup steps, status and actions

No new HTTP route: the guide is part of the admin console and uses server actions and server loaders only. The public admin API (`docs/admin-api.md`) is unchanged.

## The catalogue (`src/lib/setup/steps.ts`)

| Key              | Label                                   | Group       | Kind              | Done when                                                             | Who may change      |
| ---------------- | --------------------------------------- | ----------- | ----------------- | --------------------------------------------------------------------- | ------------------- |
| `site_url`       | Site address                            | required    | outside           | The public site address is present and a well-formed web address      | n/a (hosting)       |
| `wedding_event`  | Wedding event                           | required    | console           | `settings.wedding_event_id` is set and the event has a date           | Couple and planner  |
| `email_sending`  | Email sending                           | required    | outside           | Both the email key and the from address are present                   | n/a (hosting)       |
| `link_key`       | Personal link key                       | required    | outside           | The invite-link key is present                                        | n/a (hosting)       |
| `schedule_key`   | Scheduled sending key                   | required    | outside           | The scheduled-send secret is present                                  | n/a (hosting)       |
| `card_details`   | Place line and note                     | recommended | console           | The place line is set                                                 | Couple and planner  |
| `rsvp_deadline`  | Default RSVP deadline                   | recommended | console           | A default deadline is set                                             | Couple and planner  |
| `rsvp_closed`    | Close the RSVP until invitations go out | recommended | console           | `settings.rsvp_open` is false, or the person confirms leaving it open | Couple and planner  |
| `texting`        | Texting                                 | recommended | outside + console | Provider values present and the couple's switch on                    | Switch: couple only |
| `email_tracking` | Email delivery tracking                 | recommended | outside           | The provider's webhook signing key is present                         | n/a (hosting)       |
| `sending_domain` | Sending domain verified                 | recommended | manual            | A staff member has confirmed it (shared mark)                         | Couple and planner  |

**Where it lives.** Each `console` step may carry a `page`: `{ href, name }`, the console address where the thing is set up (with the field, when the page has one for it) and the page's name for the link text. In the guide's step list a step with a `page` is a link to it that keeps the guide open on that step; every other step selects its detail in the guide.

| Key             | `page.href`                             | `page.name` |
| --------------- | --------------------------------------- | ----------- |
| `wedding_event` | `/admin/events`                         | Events      |
| `card_details`  | `/admin/settings#save-the-date-place`   | Settings    |
| `rsvp_deadline` | `/admin/settings#default-rsvp-deadline` | Settings    |
| `rsvp_closed`   | `/admin/settings#rsvp-open`             | Settings    |

Steps set outside the console, the manual step and `texting` have no `page`.

Order is the table order. A step's text (purpose, "if unset", instructions, the names of the hosting values to set) lives in the catalogue beside it, so one edit changes the guide, the banner count and the tests.

## `evaluateSetup(inputs)` (pure)

Inputs: `{ settings: { weddingEventId, weddingEventDate, rsvpOpen, defaultDeadline, place }, env: { siteUrl, emailKey: boolean, emailFrom: boolean, linkKey: boolean, scheduleKey: boolean, webhookKey: boolean }, sms: { configured, enabled }, confirmed: string[] }`. Secrets arrive as booleans only.

Output: `{ steps: [{ key, status: "done" | "open", reason?: string }], requiredOpen: number, requiredTotal: number, recommendedOpen: number }`.

## `bannerMode(status, state)` (pure)

`hidden` when `requiredOpen = 0`; `compact` when `state.left_guide` and every open required key is in `state.seen_required`; otherwise `full`.

## Server actions (`src/lib/admin/actions/setup.ts`, staff only, each returns `ActionResult`)

| Action                                    | Effect                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `leaveGuide`                              | Sets `left_guide` true and `seen_required` to the current required keys; records `last_step`. |
| `resumeGuide`                             | Sets `left_guide` false.                                                                      |
| `skipStep(key)`                           | Adds the key to `skipped_steps` and moves `last_step` to the next open step.                  |
| `restartGuide`                            | Deletes the person's row (clears skips, position and left state). Changes no site value.      |
| `recordPosition(key)`                     | Saves `last_step` as the person moves between steps, including by a step's `page` link.       |
| `confirmStep(key)` / `unconfirmStep(key)` | Insert or delete a shared mark; only for `manual` steps.                                      |
| `checkAgain`                              | Revalidates the console layout and returns the fresh status of one step.                      |

An unknown step key is refused. Every action checks `is_staff()` through the existing session guard. Console steps save through the existing settings and details actions.

## Logging

Failures log only the name of the failing read through `src/lib/log.ts`. No value of any environment variable is ever returned, rendered or logged.
