# Contract: calendar entry

One entry, built by `src/lib/calendar` from the save the date details. Nothing is stored.

## The file

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Chris and Hannah//Save the date//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:save-the-date@<site domain>
SEQUENCE:<settings.save_the_date_revision>
DTSTAMP:<UTC now>
LAST-MODIFIED:<UTC now>
SUMMARY:<couple names>'s wedding
DTSTART;VALUE=DATE:YYYYMMDD
DTEND;VALUE=DATE:<next day YYYYMMDD>
LOCATION:<place line, if any>
DESCRIPTION:<note line, if any>\n<site address>
URL:<site address>
TRANSP:TRANSPARENT
X-MICROSOFT-CDO-ALLDAYEVENT:TRUE
END:VEVENT
END:VCALENDAR
```

Rules enforced by tests:

- CRLF line endings, lines folded at 75 octets, text escaped (commas, semicolons, backslashes, newlines).
- `DTEND` is the day after `DTSTART` (exclusive end), including across month and year ends and leap days.
- The file contains no personal link, no token, no household name, no email address and no phone number.
- `UID` is constant across edits; `SEQUENCE` follows the revision.

## The links

| Calendar                | Link                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google                  | `https://calendar.google.com/calendar/render?action=TEMPLATE&text=<title>&dates=YYYYMMDD/<next day>&details=<note and site>&location=<place>`                                                                 |
| Outlook (web, personal) | `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=<title>&startdt=YYYY-MM-DD&enddt=<next day>&allday=true&body=<note and site>&location=<place>` |
| Apple and other         | the file                                                                                                                                                                                                      |

Values are URL-encoded. The Outlook host is one constant, because it has changed before.
