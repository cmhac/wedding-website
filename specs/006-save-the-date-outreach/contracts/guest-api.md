# Contract: guest interface additions

Published for the designer in `docs/guest-api.md` once built. All JSON errors use the existing shape.

| Method and path                         | Purpose                                            | Success | Errors                    |
| --------------------------------------- | -------------------------------------------------- | ------- | ------------------------- |
| `GET /api/guest/save-the-date`          | The card's facts and the calendar choices          | 200     | 401 not signed in, 403    |
| `GET /api/guest/save-the-date/calendar` | The calendar file (`text/calendar`, as a download) | 200     | 401, 403, 409 `not_ready` |

## `GET /api/guest/save-the-date`

```json
{
  "couple_names": "Chris & Hannah",
  "date": "2027-09-18",
  "place": "Napa Valley, California",
  "note": "Invitation to follow",
  "calendar": {
    "google": "https://calendar.google.com/calendar/render?action=TEMPLATE&...",
    "outlook": "https://outlook.live.com/calendar/0/deeplink/compose?...",
    "file": "/api/guest/save-the-date/calendar"
  }
}
```

- `date` is a calendar date, never a moment. When the wedding date is not set, `date` is `null` and `calendar` is `null` (no wrong entry is produced).
- Contains nothing about any household and no personal link.
- Staff sessions may call it too (for the preview).

## `GET /api/guest/save-the-date/calendar`

Returns the all-day calendar file with `Content-Type: text/calendar; charset=utf-8` and `Content-Disposition: attachment; filename="save-the-date.ics"`. `409 not_ready` when the date is not set. See [calendar.md](./calendar.md).

## Landing

`GET /i/<token>?next=/save-the-date` signs the household in and redirects there. `next` is honored only for the guest landing path and `/save-the-date`; anything else is ignored, as today. The save the date email and text carry this link; invitations, reminders and updates carry the plain link.

## The placeholder page

`/save-the-date` (not an API): a signed-in guest sees the couple's names, the date, the place line, the note line and three calendar buttons; the existing consent step appears below the date when there are numbers to ask about; a visitor who is not signed in is redirected to `/`. The designer replaces the page and reads the same endpoint.
