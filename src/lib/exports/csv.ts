/**
 * CSV builders for the staff exports (guests, responses, caterer). Pure
 * functions over row data; the route that loads the rows lives elsewhere.
 * Cells are spreadsheet-safe: a cell starting with `=`, `+`, `-`, `@`, tab or
 * carriage return is prefixed with an apostrophe to block formula injection.
 */

type Cell = string | number | boolean | null | undefined;

const DANGEROUS_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && DANGEROUS_START.test(text)) {
    text = `'${text}`;
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: readonly string[], rows: Cell[][]): string {
  const out = [header.join(",")];
  for (const row of rows) out.push(row.map(escapeCell).join(","));
  return out.join("\r\n") + "\r\n";
}

export type GuestEventRow = {
  household: string;
  guest: string;
  event: string;
  status: string;
  dietary_categories: string[];
  dietary_notes: string | null;
};

export function buildGuestsCsv(rows: GuestEventRow[]): string {
  return toCsv(
    [
      "household",
      "guest",
      "event",
      "status",
      "dietary_categories",
      "dietary_notes",
    ],
    rows.map((r) => [
      r.household,
      r.guest,
      r.event,
      r.status,
      r.dietary_categories.join("; "),
      r.dietary_notes,
    ]),
  );
}

export type ResponseRow = {
  household: string;
  guest: string;
  event: string;
  status: string;
  responded_at: string | null;
  dishes: string[];
};

export function buildResponsesCsv(rows: ResponseRow[]): string {
  return toCsv(
    ["household", "guest", "event", "status", "responded_at", "dishes"],
    rows.map((r) => [
      r.household,
      r.guest,
      r.event,
      r.status,
      r.responded_at,
      r.dishes.join("; "),
    ]),
  );
}

export type CatererData = {
  /** Chosen counts for attending guests only. */
  dishTotals: { event: string; course: string; dish: string; count: number }[];
  notYetChosen: { event: string; course: string; count: number }[];
  /** Attending guests only. */
  restrictions: {
    event: string;
    household: string;
    guest: string;
    severity: string;
    category: string | null;
    notes: string | null;
  }[];
  conflicts: {
    event: string;
    course: string;
    dish: string;
    household: string;
    guest: string;
    category: string | null;
  }[];
};

const CATERER_HEADER = [
  "section",
  "event",
  "course",
  "dish",
  "count",
  "household",
  "guest",
  "severity",
  "category",
  "notes",
] as const;

export function buildCatererCsv(data: CatererData): string {
  const rows: Cell[][] = [];
  for (const d of data.dishTotals) {
    rows.push(["dish_total", d.event, d.course, d.dish, d.count]);
  }
  for (const d of data.notYetChosen) {
    rows.push(["not_yet_chosen", d.event, d.course, "", d.count]);
  }
  for (const r of data.restrictions) {
    rows.push([
      "restriction",
      r.event,
      "",
      "",
      "",
      r.household,
      r.guest,
      r.severity,
      r.category,
      r.notes,
    ]);
  }
  for (const c of data.conflicts) {
    rows.push([
      "meal_conflict",
      c.event,
      c.course,
      c.dish,
      "",
      c.household,
      c.guest,
      "",
      c.category,
    ]);
  }
  return toCsv(CATERER_HEADER, rows);
}
