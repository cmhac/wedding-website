import { parse } from "csv-parse/sync";
import { z } from "zod";

/**
 * Guest-list CSV import: parsing and validation only (no database access).
 *
 * One row per guest. Required columns: `household_name`, `first_name`,
 * `last_name`. Optional: `household_ref` (groups rows into a household; without
 * it rows are grouped by household name plus contact email), `contact_email`,
 * `plus_one_allowance` (integer >= 0, default 0), `guest_email`,
 * `dietary_notes`, `notes`, and one `event:<slug>` column per event, holding
 * yes/true/1/x to invite the guest or no/false/0 or blank.
 *
 * Row numbers are spreadsheet rows: the header is row 1. A household with any
 * invalid row is not returned (no partial households). Error messages never
 * repeat cell values, so they are safe to log.
 */

export type ImportGuest = {
  row: number;
  first_name: string;
  last_name: string;
  email: string | null;
  dietary_notes: string | null;
  notes: string | null;
  events: string[];
};

export type ImportHousehold = {
  ref: string;
  display_name: string;
  contact_email: string | null;
  /** True when the household has no email and needs a paper invitation. */
  paper_only: boolean;
  plus_one_allowance: number;
  guests: ImportGuest[];
};

export type ImportError = { row: number; field: string; message: string };

export type ImportResult = {
  households: ImportHousehold[];
  errors: ImportError[];
  counts: { households: number; guests: number; invitations: number };
};

export type ImportOptions = { eventSlugs: readonly string[] };

const REQUIRED = ["household_name", "first_name", "last_name"] as const;
const EVENT_PREFIX = "event:";
const TRUE_VALUES = new Set(["yes", "y", "true", "1", "x"]);
const FALSE_VALUES = new Set(["", "no", "n", "false", "0"]);

const emailSchema = z.email();
const allowanceSchema = z.coerce.number().int().min(0);

export function parseGuestImport(
  csv: string,
  options: ImportOptions,
): ImportResult {
  const errors: ImportError[] = [];
  const empty = (): ImportResult => ({
    households: [],
    errors,
    counts: { households: 0, guests: 0, invitations: 0 },
  });

  let records: string[][];
  try {
    records = parse(csv, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
      trim: true,
    }) as string[][];
  } catch {
    errors.push({
      row: 1,
      field: "file",
      message: "The file is not valid CSV",
    });
    return empty();
  }
  if (records.length === 0) {
    errors.push({ row: 1, field: "file", message: "The file is empty" });
    return empty();
  }

  const header = records[0].map((h) => h.trim().toLowerCase());
  const col = new Map(header.map((h, i) => [h, i]));
  for (const name of REQUIRED) {
    if (!col.has(name)) {
      errors.push({
        row: 1,
        field: name,
        message: "Required column is missing",
      });
    }
  }
  if (errors.length > 0) return empty();

  const known = new Set(options.eventSlugs);
  const eventColumns = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.startsWith(EVENT_PREFIX))
    .map(({ h, i }) => ({ field: h, slug: h.slice(EVENT_PREFIX.length), i }));

  type Group = {
    household: ImportHousehold;
    invalid: boolean;
    seen: Set<string>;
  };
  const groups = new Map<string, Group>();
  const order: Group[] = [];

  records.slice(1).forEach((cells, index) => {
    const row = index + 2;
    const get = (name: string) => (cells[col.get(name) ?? -1] ?? "").trim();
    if (cells.every((c) => c.trim() === "")) {
      errors.push({ row, field: "row", message: "Blank row skipped" });
      return;
    }

    const rowErrors: ImportError[] = [];
    const fail = (field: string, message: string) =>
      rowErrors.push({ row, field, message });

    const displayName = get("household_name");
    const firstName = get("first_name");
    const lastName = get("last_name");
    if (!displayName) fail("household_name", "Required");
    if (!firstName) fail("first_name", "Required");
    if (!lastName) fail("last_name", "Required");

    const emailRaw = get("contact_email");
    let contactEmail: string | null = null;
    if (emailRaw) {
      if (emailSchema.safeParse(emailRaw).success) {
        contactEmail = emailRaw.toLowerCase();
      } else {
        fail("contact_email", "Not a valid email address");
      }
    }

    const guestEmailRaw = get("guest_email");
    let guestEmail: string | null = null;
    if (guestEmailRaw) {
      if (emailSchema.safeParse(guestEmailRaw).success) {
        guestEmail = guestEmailRaw.toLowerCase();
      } else {
        fail("guest_email", "Not a valid email address");
      }
    }

    const allowanceRaw = get("plus_one_allowance");
    let allowance = 0;
    if (allowanceRaw) {
      const parsed = allowanceSchema.safeParse(allowanceRaw);
      if (parsed.success && /^\d+$/.test(allowanceRaw)) {
        allowance = parsed.data;
      } else {
        fail("plus_one_allowance", "Must be a whole number, 0 or more");
      }
    }

    const events: string[] = [];
    for (const { field, slug, i } of eventColumns) {
      const value = (cells[i] ?? "").trim().toLowerCase();
      if (TRUE_VALUES.has(value)) {
        if (known.has(slug)) events.push(slug);
        else fail(field, "Unknown event");
      } else if (!FALSE_VALUES.has(value)) {
        fail(field, "Use yes or no");
      }
    }

    const ref = get("household_ref");
    const key = ref
      ? `ref:${ref}`
      : `name:${displayName.toLowerCase()}|${contactEmail ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        household: {
          ref: ref || key,
          display_name: displayName,
          contact_email: contactEmail,
          paper_only: contactEmail === null,
          plus_one_allowance: allowance,
          guests: [],
        },
        invalid: false,
        seen: new Set(),
      };
      groups.set(key, group);
      order.push(group);
    } else {
      const h = group.household;
      if (displayName && displayName !== h.display_name) {
        fail("household_name", "Differs from earlier rows of this household");
      }
      if (emailRaw !== "" && contactEmail !== h.contact_email) {
        fail("contact_email", "Differs from earlier rows of this household");
      }
      if (allowanceRaw && allowance !== h.plus_one_allowance) {
        fail(
          "plus_one_allowance",
          "Differs from earlier rows of this household",
        );
      }
    }

    if (firstName && lastName) {
      const guestKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
      if (group.seen.has(guestKey)) {
        fail("row", "Duplicate guest in this household");
      }
      group.seen.add(guestKey);
    }

    if (rowErrors.length > 0) {
      group.invalid = true;
      errors.push(...rowErrors);
      return;
    }
    group.household.guests.push({
      row,
      first_name: firstName,
      last_name: lastName,
      email: guestEmail,
      dietary_notes: get("dietary_notes") || null,
      notes: get("notes") || null,
      events,
    });
  });

  const households = order.filter((g) => !g.invalid).map((g) => g.household);
  errors.sort((a, b) => a.row - b.row);
  return {
    households,
    errors,
    counts: {
      households: households.length,
      guests: households.reduce((n, h) => n + h.guests.length, 0),
      invitations: households.reduce(
        (n, h) => n + h.guests.reduce((m, g) => m + g.events.length, 0),
        0,
      ),
    },
  };
}
