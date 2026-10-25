# Contract: Excel support for the guest-list import

A change to the existing `POST /api/admin/guests/import` (see [`specs/001-guest-data-model/contracts/http-endpoints.md`](../../001-guest-data-model/contracts/http-endpoints.md)). CSV keeps working exactly as it does today.

## Request

| Format | `Content-Type`                                                      | Body                          |
| ------ | ------------------------------------------------------------------- | ----------------------------- |
| CSV    | `text/csv` (or anything not listed below, as today)                 | The CSV text                  |
| Excel  | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | The `.xlsx` file as raw bytes |

- The route reads the body as bytes and picks the format from the header. An unknown or missing header is treated as CSV, so existing callers and `scripts/import-guests.ts` are unaffected.
- Limits: 2 MiB upload (existing), and at most 5,000 rows in the sheet (new). Both fail with `invalid_file`.
- Excel files are read from the **first sheet**. The columns are the same as the CSV (see `src/lib/guests/import.ts`): `household_name`, `first_name`, `last_name` required; `household_ref`, `contact_email`, `plus_one_allowance`, `guest_email`, `dietary_notes`, `notes`, and `event:<slug>` optional.

## Conversion

The sheet is converted to the same text the CSV parser takes, then goes through the unchanged `parseGuestImport` and `import_households` path, so validation, per-row errors and the "a household with any bad row is skipped whole" rule are identical.

| Cell value | Becomes                               |
| ---------- | ------------------------------------- |
| Text       | The text, trimmed                     |
| Number     | The number written without formatting |
| Boolean    | `true` or `false`                     |
| Date       | The ISO date (`YYYY-MM-DD`)           |
| Empty      | Empty                                 |

Row numbers in errors are the sheet's own row numbers, with the header row as row 1. A test must prove this holds when the sheet has blank rows before the header (see research R6, open point 1).

## Response

Same as today, plus one optional field:

```json
{
  "created": { "households": 41, "guests": 87, "invitations": 203 },
  "errors": [{ "row": 14, "field": "contact_email", "message": "..." }],
  "source": {
    "format": "xlsx",
    "sheet": { "name": "Guest list", "index": 1, "count": 2 }
  }
}
```

- `source` is always present from this change on. For CSV it is `{ "format": "csv" }` with no `sheet`.
- For Excel, `sheet.index` counts from 1 and `sheet.count` is the number of sheets in the file, so the screen can say "the first of 2 sheets".

## Errors (all `422 invalid_file`, body as in `docs/admin-api.md`)

| Case                                              | Message shown                                               |
| ------------------------------------------------- | ----------------------------------------------------------- |
| Not a valid `.xlsx` (corrupt, or an older `.xls`) | "This file could not be read. Upload a .csv or .xlsx file." |
| Password-protected or unreadable                  | Same message                                                |
| No sheets, or the first sheet is empty            | "The file is empty."                                        |
| More than 5,000 rows                              | "The file has too many rows."                               |
| Required column missing                           | Per-row error on row 1, as for CSV                          |

Error messages never repeat cell values (existing rule), so they are safe to log.

## Client wrapper

`src/lib/admin-api/client.ts` gains `importGuestsFile(file: File)`, which sends the bytes with the right `Content-Type` and returns the same `ApiResult<ImportResponse>`. The existing `importGuests(csv: string)` stays. `importResponseSchema` gains the `source` object, which the route now always sends.

## Tests required (before the code)

1. Route: an `.xlsx` and the equivalent CSV return identical `created` and `errors`.
2. Route: `source.sheet` is correct for a two-sheet workbook.
3. Route: the row-number test with blank rows before the header.
4. Route: each error case in the table above.
5. Wrapper: the header and body are sent correctly, and a bad response is reported as `bad_response`.
6. Contract test: `docs/admin-api.md` and the route table still match.
