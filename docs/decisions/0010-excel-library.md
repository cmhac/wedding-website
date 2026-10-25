# 0010: Excel library for the guest import

Status: proposed until the couple confirms

The guest import accepts `.xlsx` as well as CSV. The server reads the first
sheet, turns it into the same text the CSV parser already takes, and runs the
unchanged validation, so both formats give identical results. Chosen library:
**`read-excel-file`**. Details of the import are in
[`specs/002-admin-console-v0/contracts/import-excel.md`](../../specs/002-admin-console-v0/contracts/import-excel.md).

## Comparison

Facts from the npm registry and each project's README, checked on 2026-10-25.

| Library           | Version and date                                              | Notes                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-excel-file` | 9.3.12, last modified 2026-10-07, MIT, about 2.7 MB unpacked  | Reads `.xlsx`; Node entry accepts a file path, stream, Buffer or Blob; `readSheet` returns rows as arrays of string, number, boolean or Date and reads the first sheet by default; legacy `.xls` throws an error.                                                |
| `exceljs`         | 4.4.0, last published 2024-12-20, MIT, about 21.8 MB unpacked | Much larger and aimed at writing as well as reading; no release in the last ten months.                                                                                                                                                                          |
| `xlsx` (SheetJS)  | npm still serves 0.18.5                                       | Snyk and SheetJS's own issue tracker report prototype pollution (fixed in 0.19.3) and a denial-of-service regular expression (fixed in 0.20.2) that affect files read by the library. The fixed releases are not published to npm, only from SheetJS's own site. |

## Why `read-excel-file`

It is small, current, MIT-licensed, reads only (all the import needs), and avoids
a library whose npm release has known file-parsing flaws.

## Open points, to confirm in the first test rather than assume

1. Whether the row numbers it returns match Excel's row numbers when the sheet
   starts with blank rows. Error messages tell staff "row 14", so this must match
   what they see in Excel.
2. How to list every sheet name for the "which sheet was read" message. The
   README says the default export returns all sheets as `{ sheet, data }` and that
   a separate sheet-names function was removed in version 8.
3. The README says nothing about decompression limits, so the route keeps its
   2 MiB upload cap and adds a row cap of 5,000.

## Alternatives rejected

Parsing in the browser and sending CSV text (ships a large library to the browser
and puts untrusted-file parsing where the server tests cannot reach it), and
asking staff to save as CSV (the couple asked for CSV or Excel).
