import { SITE_DOMAIN } from "@/lib/site/legal";

/**
 * The save the date as a calendar entry (contracts/calendar.md): one all-day
 * entry, built from the card's facts alone. It takes no household, personal
 * link or token, because calendar entries are shared and forwarded.
 */

export type CalendarEntry = {
  /** The wedding date, `YYYY-MM-DD`: a calendar date, never a moment. */
  date: string;
  title: string;
  place: string | null;
  note: string | null;
  siteUrl: string;
  /** The details revision; the file's SEQUENCE. */
  revision: number;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [number, number, number] {
  const match = DATE.exec(date);
  if (!match) throw new Error("not a calendar date");
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error("not a calendar date");
  }
  return [y, m, d];
}

/** The day after a `YYYY-MM-DD` date: the exclusive end of a one-day entry. */
export function nextDay(date: string): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** `20270918` from `2027-09-18`. */
export function compactDate(date: string): string {
  parts(date);
  return date.replaceAll("-", "");
}

export function escapeText(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a line at 75 octets, never inside a character (RFC 5545, 3.1). */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    // A continuation line starts with a space, which counts toward its 75.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** What the entry says besides its title: the note, then the site address. */
export function entryDescription(entry: CalendarEntry): string {
  return [entry.note, entry.siteUrl].filter(Boolean).join("\n");
}

export function buildIcs(entry: CalendarEntry, now: Date = new Date()): string {
  const start = compactDate(entry.date);
  const end = compactDate(nextDay(entry.date));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chris and Hannah//Save the date//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:save-the-date@${SITE_DOMAIN}`,
    `SEQUENCE:${Math.max(0, Math.trunc(entry.revision))}`,
    `DTSTAMP:${stamp(now)}`,
    `LAST-MODIFIED:${stamp(now)}`,
    `SUMMARY:${escapeText(entry.title)}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    ...(entry.place ? [`LOCATION:${escapeText(entry.place)}`] : []),
    `DESCRIPTION:${escapeText(entryDescription(entry))}`,
    `URL:${entry.siteUrl}`,
    "TRANSP:TRANSPARENT",
    "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
