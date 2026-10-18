# Contract: Guest API

The only interface between this backend and the guest-facing screens. **The designer's frontend calls it; this repository builds no guest-facing screens.** It is published for the designer as `docs/guest-api.md` and enforced by a contract test (the endpoint table below must match the route handlers on disk).

Assumptions to confirm with the designer: the frontend is served from the same origin as this Next.js app (session cookies are same-site and set by the server), and `/rsvp` is the path the designer's frontend serves after sign-in.

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

| Method and path            | Purpose                                     | Success | Errors                                                               |
| -------------------------- | ------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `POST /api/guest/sign-in`  | Email a sign-in link                        | 202     | 422 invalid email format, 429 rate limited                           |
| `POST /api/guest/sign-out` | End the session                             | 204     | none                                                                 |
| `GET /api/guest/rsvp`      | Read the household, guests, events, menus   | 200     | 401 not signed in, 403 not a guest                                   |
| `PUT /api/guest/rsvp`      | Save answers, meals, dietary needs, message | 200     | 401, 403, 409 `rsvp_closed`, 422 `invalid_payload` or `invalid_meal` |
| `POST /api/guest/plus-one` | Name a plus-one placeholder                 | 200     | 401, 403, 409 `rsvp_closed`, 409 `not_a_placeholder`, 422            |
| `POST /api/guest/opt-out`  | Turn reminder emails off or on              | 200     | 401, 403, 422                                                        |
| `GET /auth/callback`       | Completes sign-in from the emailed link     | 302     | 302 to the sign-in failure path                                      |

## Sign-in

`POST /api/guest/sign-in` with `{ "email": "..." }` always answers `202` with `{ "message": "If that address is on the guest list, a link is on its way." }`, whether the address is known, unknown, or Supabase returned an error (research R2). The emailed link opens `/auth/callback`, which sets the session cookie and redirects to `/rsvp`.

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

## `PUT /api/guest/rsvp` request

The `submit_household_rsvp` payload in [database-rpc.md](./database-rpc.md): `message_to_couple`, and per guest `dietary_notes`, `dietary`, `responses` (event id and `attending` or `declined`), and `meals` (course id and dish id). The response is the updated `GET` body. A payload that is partly past its deadline fails as a whole with `409 rsvp_closed`.

## `POST /api/guest/plus-one`, `POST /api/guest/opt-out`

- Plus-one: `{ "guest_id": "uuid", "first_name": "string", "last_name": "string" }`; returns the updated guest.
- Opt-out: `{ "opt_out": true }`; returns `{ "opt_out": true }`. Affects non-essential emails only (FR-021).

## Rules

- Staff sessions are refused (`403`) on guest endpoints; staff use the admin area.
- No endpoint accepts a household id from the client; the household always comes from the session.
- Request and response shapes are the zod schemas exported from `src/lib/guest-api/schemas.ts`, with typed fetch wrappers in `src/lib/guest-api/client.ts`.
- Validation covered in tests: unauthenticated, wrong household, closed RSVPs, invalid payloads, and the neutral sign-in message.
