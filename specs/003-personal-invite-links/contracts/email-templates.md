# Contract changes: Email templates

Changes to [`specs/001-guest-data-model/contracts/email-templates.md`](../../001-guest-data-model/contracts/email-templates.md). When implemented, that file is updated to match.

## Props

- `MagicLinkProps` is unchanged: `{ sign_in_url, audience: "guest" | "staff" }`. For guests, `sign_in_url` now points at `/auth/confirm` on the site (research R5); for staff, it is Supabase's verify URL as today.
- `CampaignProps` gains `personal_link: string`, the household's `/i/<token>` URL. `rsvp_url` stays (the plain RSVP page, for templates that want it). As before, props are built by picking contract fields only, so no address, postal address, dietary data or notes can reach a template.

## Registered first drafts

By the couple's permission (recorded in `CLAUDE.md`), this feature registers plain first-draft templates in `emails/`, for the couple to polish. No visual design: plain layout, no brand styling.

| Key             | Used by                              | Must include                                                          |
| --------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `magic_link`    | guest sign-in route, Send Email hook | the sign-in link; wording that differs for `audience` guest and staff |
| `invitation`    | invitation campaigns                 | `personal_link`, the household name, the events, `respond_by`         |
| `rsvp_reminder` | reminder campaigns                   | `personal_link`, `respond_by`, what is still pending                  |

Each returns `{ subject, html, text }` with both an HTML and a plain-text body. Tests render each with fixture props and check that the link is present in both bodies and that no prop outside the contract is read. Other keys (`save_the_date`, `optional_events_reminder`, `update`) stay unregistered and keep refusing to send, as today.
