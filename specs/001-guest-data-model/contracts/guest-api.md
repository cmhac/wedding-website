# Contract: Guest API

The only interface between this backend and the guest-facing screens. **The designer's frontend calls it; this repository builds no guest-facing screens.** It is published for the designer as `docs/guest-api.md` and enforced by a contract test (the endpoint table below must match the route handlers on disk).

Assumptions to confirm with the designer: the frontend is served from the same origin as this Next.js app (session cookies are same-site and set by the server), and the RSVP path in `GUEST_RSVP_PATH` is where the designer's frontend serves the RSVP once it exists; until then guests land on `/`, the placeholder homepage built in this repository (see `specs/004-placeholder-homepage`).

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

| Method and path               | Purpose                                                               | Success | Errors                                                                    |
| ----------------------------- | --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `GET /i/[token]`              | Open a household's personal invite link: sign in and go to the RSVP   | 302     | 302 to the sign-in failure path                                           |
| `GET /t/[token]`              | Open the sign-in link texted to a typed phone number (15 minutes)     | 302     | 302 to the sign-in failure path                                           |
| `GET /auth/confirm`           | Complete a typed-address sign-in link                                 | 302     | 302 to the sign-in failure path                                           |
| `POST /auth/confirm`          | Same, for a frontend "Continue" page (form-encoded fields)            | 302     | 302 to the sign-in failure path                                           |
| `POST /api/guest/sign-in`     | Email (or, once texting is on, text) a sign-in link to what was typed | 202     | 422 invalid email format, 429 rate limited                                |
| `POST /api/guest/sign-out`    | End the session                                                       | 204     | none                                                                      |
| `GET /api/guest/rsvp`         | Read the household, guests, events, menus                             | 200     | 401 not signed in, 403 not a guest                                        |
| `PUT /api/guest/rsvp`         | Save answers, meals, dietary needs, message                           | 200     | 401, 403, 409 `rsvp_closed`, 422 `invalid_payload` or `invalid_meal`      |
| `POST /api/guest/plus-one`    | Name a plus-one placeholder                                           | 200     | 401, 403, 409 `rsvp_closed`, `not_a_placeholder` or `duplicate_name`, 422 |
| `POST /api/guest/opt-out`     | Turn reminder emails off or on                                        | 200     | 401, 403, 422                                                             |
| `GET /api/guest/sms-consent`  | The numbers still to ask about (empty while texting is off)           | 200     | 401, 403                                                                  |
| `POST /api/guest/sms-consent` | Record the consent step's answers                                     | 200     | 401, 403, 409 `texting_unavailable`, 422                                  |
| `GET /auth/callback`          | Completes sign-in from the emailed link                               | 302     | 302 to the sign-in failure path                                           |

## Sign-in

A household has one shared sign-in; any of its people can use it, on any device, and a household can have several email addresses. There are two ways in.

**Personal link, `GET /i/[token]`.** Each household has a personal link (`/i/<household id>.<signature>`, never containing a name or address) that is in its invitation emails. Opening it sets the session cookie and redirects `302` to the guest landing path (`GUEST_RSVP_PATH`, default `/`; an optional relative `next` under that path is honoured). The link is reusable: every open creates its own session, so it works on any number of devices, and it keeps working after the RSVP deadline (`deadline_passed` in the RSVP response says so; saves are refused with `409 rsvp_closed`). It stops working on the wedding day (typed-address sign-in and open sessions are not affected), when staff reissue it (the old link stops at once), or if it is malformed. Every failure is a `302` to `/auth/error` with no detail, with `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

**Typed address, `POST /api/guest/sign-in`** with `{ "email": "..." }` always answers `202` with `{ "message": "If that address is on the guest list or belongs to a staff account, a link is on its way." }` after at least 1.5 seconds, whether the address is a household address, a staff address, unknown, over a limit, or something failed. For an address on a household, the site emails a link to **that address**. Any other address is tried as a staff address: Supabase emails a staff sign-in link only when a staff account exists (staff addresses are never household addresses), and the link opens `GET /auth/callback`, which lands on the admin console. The link opens `GET /auth/confirm?token_hash=...&type=email`, which sets the session cookie and redirects to the guest landing path. The same fields can be sent as a form `POST` to `/auth/confirm`, so a frontend can show a "Continue" page first (a mail scanner that only opens the link then does not use the token up). A link is single use and short lived; ask again for a new one. The home page's one prompt uses this endpoint for guests and staff alike; the admin console's own sign-in page still uses `POST /api/admin/sign-in`.

Guests stay signed in until staff use "sign out everywhere" for the household (access ends on the next request) or `POST /api/guest/sign-out` ends this device's session only; other devices of the same household stay signed in.

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

The `submit_household_rsvp` payload in [database-rpc.md](./database-rpc.md): `message_to_couple`, and per guest `dietary_notes`, `dietary`, `responses` (event id and `attending` or `declined`), and `meals` (course id and dish id). The response is the updated `GET` body. A payload that is partly past its deadline fails as a whole with `409 rsvp_closed`.

## `POST /api/guest/plus-one`, `POST /api/guest/opt-out`

- Plus-one: `{ "guest_id": "uuid", "first_name": "string", "last_name": "string" }`; returns the updated guest.
- Opt-out: `{ "opt_out": true }`; returns `{ "opt_out": true }`. Affects non-essential emails only (FR-021).

## Rules

- Staff sessions are refused (`403`) on guest endpoints; staff use the admin area.
- Any session of the household may use every guest endpoint; there is no separate "responder".
- No endpoint accepts a household id from the client; the household always comes from the session.
- Request and response shapes are the zod schemas exported from `src/lib/guest-api/schemas.ts`, with typed fetch wrappers in `src/lib/guest-api/client.ts`.
- Validation covered in tests: unauthenticated, wrong household, closed RSVPs, invalid payloads, and the neutral sign-in message.
