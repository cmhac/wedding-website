# Guest API

> **No guest-facing user interface is provided.** This repository builds no public site and no guest screens (including the RSVP), forms, or visual components for guests. (A minimal, temporary v0 admin console exists for staff; it does not use this API.) The couple's designer builds the guest-facing screens against this document. The guest API is the only interface between this backend and the guest-facing screens.

This document is published from `specs/001-guest-data-model/contracts/guest-api.md`. A contract test (`src/lib/guest-api/__tests__/contract.test.ts`) fails if the endpoint table below stops matching the route handlers under `src/app/api/guest/`.

## Assumptions to confirm with the designer

- The frontend is served from the **same origin** as this Next.js app. Session cookies are set by the server and are same-site; no cross-origin (CORS) support is built.
- The frontend serves the path `/rsvp` (configurable on the server with `GUEST_RSVP_PATH`) and the sign-in failure path `/auth/error`. Guests are redirected to these after following the emailed link.

All endpoints return JSON. Errors use one shape:

```json
{
  "error": {
    "code": "rsvp_closed",
    "message": "RSVPs are closed. Please contact us.",
    "issues": [{ "path": ["guests", 0, "meals"], "message": "..." }]
  }
}
```

`issues` appears only on `422`. Messages never contain other households' data or reveal whether an email is on the guest list.

| Method and path            | Purpose                                                             | Success | Errors                                                                    |
| -------------------------- | ------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `GET /i/[token]`           | Open a household's personal invite link: sign in and go to the RSVP | 302     | 302 to the sign-in failure path                                           |
| `GET /auth/confirm`        | Complete a typed-address sign-in link                               | 302     | 302 to the sign-in failure path                                           |
| `POST /auth/confirm`       | Same, for a frontend "Continue" page (form-encoded fields)          | 302     | 302 to the sign-in failure path                                           |
| `POST /api/guest/sign-in`  | Email a sign-in link to the address typed                           | 202     | 422 invalid email format, 429 rate limited                                |
| `POST /api/guest/sign-out` | End the session                                                     | 204     | none                                                                      |
| `GET /api/guest/rsvp`      | Read the household, guests, events, menus                           | 200     | 401 not signed in, 403 not a guest                                        |
| `PUT /api/guest/rsvp`      | Save answers, meals, dietary needs, message                         | 200     | 401, 403, 409 `rsvp_closed`, 422 `invalid_payload` or `invalid_meal`      |
| `POST /api/guest/plus-one` | Name a plus-one placeholder                                         | 200     | 401, 403, 409 `rsvp_closed`, `not_a_placeholder` or `duplicate_name`, 422 |
| `POST /api/guest/opt-out`  | Turn reminder emails off or on                                      | 200     | 401, 403, 422                                                             |
| `GET /auth/callback`       | Completes sign-in from the emailed link                             | 302     | 302 to the sign-in failure path                                           |

## Sign-in

A household has one shared sign-in; any of its people can use it, on any device, and a household can have several email addresses. There are two ways in.

**Personal link, `GET /i/[token]`.** Each household has a personal link (`/i/<household id>.<signature>`, never containing a name or address) that is in its invitation emails. Opening it sets the session cookie and redirects `302` to `/rsvp` (an optional relative `next` under `/rsvp` is honoured). The link is reusable: every open creates its own session, so it works on any number of devices, and it keeps working after the RSVP deadline (`deadline_passed` in the RSVP response says so; saves are refused with `409 rsvp_closed`). It stops working on the wedding day (typed-address sign-in and open sessions are not affected), when staff reissue it (the old link stops at once), or if it is malformed. Every failure is a `302` to `/auth/error` with no detail, with `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

**Typed address, `POST /api/guest/sign-in`** with `{ "email": "..." }` always answers `202` with `{ "message": "If that address is on the guest list, a link is on its way." }` after at least 1.5 seconds, whether the address is known, unknown, over a limit, or something failed. For an address on a household, the site emails a link to **that address**. The link opens `GET /auth/confirm?token_hash=...&type=email`, which sets the session cookie and redirects to `/rsvp`. The same fields can be sent as a form `POST` to `/auth/confirm`, so a frontend can show a "Continue" page first (a mail scanner that only opens the link then does not use the token up). A link is single use and short lived; ask again for a new one. Staff sign-in is separate (`GET /auth/callback`).

Guests stay signed in until staff use "sign out everywhere" for the household (access ends on the next request) or `POST /api/guest/sign-out` ends this device's session.

## `GET /api/guest/rsvp` response

Built from `get_my_rsvp()`; contains only the caller's household.

```json
{
  "household": {
    "display_name": "string",
    "plus_one_allowance": 0,
    "message_to_couple": null,
    "reminders_opt_out": false
  },
  "contacts": [{ "kind": "email", "masked": "a•••@example.com" }],
  "deadline_passed": false,
  "guests": [
    {
      "id": "uuid",
      "first_name": "string | null",
      "last_name": "string | null",
      "is_placeholder": false,
      "dietary_notes": null,
      "dietary": [
        { "category_key": "nuts", "severity": "allergy", "details": null }
      ],
      "invitations": [
        {
          "status": "pending | attending | declined",
          "event": {
            "id": "uuid",
            "slug": "welcome-party",
            "name": "string",
            "starts_at": "iso",
            "venue_name": "string",
            "is_required": false,
            "group_key": "wedding-weekend",
            "display_order": 1,
            "deadline": "iso | null",
            "closed": false
          },
          "menu": {
            "status": "published | closed",
            "courses": [
              {
                "id": "uuid",
                "name": "Entrée",
                "display_order": 1,
                "requires_choice": true,
                "dishes": [
                  {
                    "id": "uuid",
                    "name": "string",
                    "description": "string | null",
                    "tags": ["vegetarian"]
                  }
                ]
              }
            ],
            "selection": [{ "course_id": "uuid", "dish_id": "uuid" }]
          }
        }
      ]
    }
  ],
  "dietary_categories": [{ "key": "nuts", "label": "Nuts", "kind": "allergen" }]
}
```

- `menu` is present only for events with a published or closed menu that the guest is attending. Draft menus and archived dishes are never returned.
- `event.is_required`, `group_key`, and `display_order` let any frontend mark optional events and group them; this API makes no presentation decisions.
- `event.closed` is true when the effective deadline has passed or RSVPs are closed globally.
- `contacts` lists the household's email addresses masked (first character, `•••`, then the domain). Guests can see but not change them; staff manage them.
- `deadline_passed` is true when every invited event is closed, so the frontend can show a "deadline passed, contact the couple" notice. Saves are still refused with `409 rsvp_closed`.

## `PUT /api/guest/rsvp` request

The `submit_household_rsvp` payload in `specs/001-guest-data-model/contracts/database-rpc.md`: `message_to_couple`, and per guest `dietary_notes`, `dietary`, `responses` (event id and `attending` or `declined`), and `meals` (course id and dish id). The response is the updated `GET` body. A payload that is partly past its deadline fails as a whole with `409 rsvp_closed`.

## `POST /api/guest/plus-one`, `POST /api/guest/opt-out`

- Plus-one: `{ "guest_id": "uuid", "first_name": "string", "last_name": "string" }`; returns the updated guest.
- Opt-out: `{ "opt_out": true }`; returns `{ "opt_out": true }`. Affects non-essential emails only (reminders only; sign-in and essential emails still go out).

## Session cookies

The browser holds the session in HTTP-only cookies set by the server when the emailed link is opened (`GET /auth/callback`). The frontend never sees or stores a token. Call the endpoints with `credentials: "same-origin"` (the client wrapper does). A request without a valid guest session gets `401`; a staff session gets `403` on guest endpoints.

## Error codes

All errors use the shape at the top of this document. `message` is safe to show to a guest. Codes the guest endpoints return:

| Status | `code`              | Meaning                                                                            |
| ------ | ------------------- | ---------------------------------------------------------------------------------- |
| 401    | `unauthenticated`   | No guest session                                                                   |
| 403    | `forbidden`         | The session is a staff session or has no household                                 |
| 403    | `not_a_guest`       | The caller has no household                                                        |
| 409    | `rsvp_closed`       | RSVPs are off, or the deadline for a changed answer has passed                     |
| 409    | `not_a_placeholder` | The plus-one place is already named                                                |
| 409    | `duplicate_name`    | Another guest in the household already has that name                               |
| 422    | `invalid_request`   | The body failed validation; `issues` lists each problem (never the submitted data) |
| 422    | `invalid_payload`   | The database refused a malformed RSVP payload                                      |
| 422    | `invalid_meal`      | A meal choice that is not available                                                |
| 429    | `rate_limited`      | Too many sign-in requests from one address                                         |
| 500    | `server_error`      | Something unexpected; no internal text is returned                                 |

## Redirect paths after sign-in

`GET /auth/callback` finishes sign-in and redirects (302): a guest to `/rsvp` (or `GUEST_RSVP_PATH`), anything unusable to `/auth/error`. An optional `next` query value is honored only if it is a plain relative path under `/rsvp`.

## Example calls

The typed wrappers in `src/lib/guest-api/client.ts` return `{ ok, status, data }` or `{ ok: false, status, error }` and never throw on an API error. Request and response shapes are the zod schemas in `src/lib/guest-api/schemas.ts`.

```ts
import { createGuestApiClient } from "@/lib/guest-api/client";

const api = createGuestApiClient();

// Always succeeds with the same message, whether or not the address is known.
await api.signIn({ email: "guest@example.com" });

const rsvp = await api.getRsvp();
if (rsvp.ok) {
  // rsvp.data.household, rsvp.data.guests, rsvp.data.dietary_categories
}

const saved = await api.submitRsvp({
  message_to_couple: null,
  guests: [
    {
      guest_id: "<uuid>",
      responses: [{ event_id: "<uuid>", status: "attending" }],
    },
  ],
});
if (!saved.ok && saved.error.code === "rsvp_closed") {
  // show saved.error.message
}

await api.namePlusOne({
  guest_id: "<uuid>",
  first_name: "Alex",
  last_name: "Example",
});
await api.setOptOut(true);
await api.signOut();
```

`scripts/guest-api-smoke.ts` runs the whole flow against a local stack and is a working example.

## Rules

- Any session of the household may use every guest endpoint; there is no separate "responder".
- Staff sessions are refused (`403`) on guest endpoints; staff use the admin API.
- No endpoint accepts a household id from the client; the household always comes from the session.
- Guest responses never include staff notes, addresses, other households, draft menus, messages, or audit data.
