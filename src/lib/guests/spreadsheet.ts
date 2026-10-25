import readXlsx from "read-excel-file/node";

/**
 * Turns the first sheet of an .xlsx file into the CSV text the guest import
 * already parses (contract: specs/002-admin-console-v0/contracts/import-excel.md).
 * No database access, no logging, and errors never repeat cell values.
 */

export const MAX_SHEET_ROWS = 5000;

export type SpreadsheetErrorReason = "unreadable" | "empty" | "too_many_rows";

export class SpreadsheetError extends Error {
  readonly reason: SpreadsheetErrorReason;
  constructor(reason: SpreadsheetErrorReason) {
    super(`Spreadsheet error: ${reason}`);
    this.name = "SpreadsheetError";
    this.reason = reason;
  }
}

export type SpreadsheetCsv = {
  csv: string;
  sheet: { name: string; index: 1; count: number };
  /**
   * Blank sheet rows above the header, which are dropped so the header is the
   * first CSV line. Add this to a row number from the import to get the row
   * number Excel shows.
   */
  rowOffset: number;
};

type Cell = string | number | boolean | Date | null | undefined;

function cellToText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") return value.trim();
  return String(value);
}

const csvField = (text: string) =>
  /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

export async function xlsxToCsv(bytes: Uint8Array): Promise<SpreadsheetCsv> {
  let sheets: { sheet: string; data: Cell[][] }[];
  try {
    sheets = (await readXlsx(Buffer.from(bytes))) as typeof sheets;
  } catch {
    throw new SpreadsheetError("unreadable");
  }
  const first = sheets[0];
  if (!first) throw new SpreadsheetError("empty");

  const text = first.data.map((row) => row.map(cellToText));
  const isBlank = (row: string[]) => row.every((c) => c === "");
  const rowOffset = text.findIndex((row) => !isBlank(row));
  if (rowOffset === -1) throw new SpreadsheetError("empty");

  const rows = text.slice(rowOffset);
  if (rows.length > MAX_SHEET_ROWS) throw new SpreadsheetError("too_many_rows");

  return {
    csv: rows.map((row) => row.map(csvField).join(",")).join("\n"),
    sheet: { name: first.sheet, index: 1, count: sheets.length },
    rowOffset,
  };
}
