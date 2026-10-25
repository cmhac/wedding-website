/**
 * Pacific-time helpers for the admin console. One zone everywhere, read from
 * NEXT_PUBLIC_ADMIN_TIME_ZONE. Uses only the built-in Intl.DateTimeFormat.
 */

export const ADMIN_TIME_ZONE: string =
  process.env.NEXT_PUBLIC_ADMIN_TIME_ZONE || "America/Los_Angeles";

export type FormatOptions = {
  date?: boolean;
  time?: boolean;
  weekday?: boolean;
};

export type TimeError = { error: string };

const SKIPPED_TIME_MESSAGE =
  "That time does not exist on that date because the clocks change.";

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Shows a moment in the admin zone, for example "Sat, Jun 12, 4:00 PM PT". */
export function formatPacific(
  value: string | Date,
  options: FormatOptions = { date: true, time: true },
): string {
  const moment = toDate(value);
  if (Number.isNaN(moment.getTime())) return "";
  const { date = false, time = false, weekday = false } = options;
  const wantDate = date || weekday || !time;

  const pieces: string[] = [];
  if (wantDate) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ADMIN_TIME_ZONE,
      ...(weekday ? { weekday: "short" as const } : {}),
      month: "short",
      day: "numeric",
    }).formatToParts(moment);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const monthDay = `${get("month")} ${get("day")}`;
    pieces.push(weekday ? `${get("weekday")}, ${monthDay}` : monthDay);
  }
  if (time) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ADMIN_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "shortGeneric",
    }).formatToParts(moment);
    pieces.push(
      parts
        .map((p) => p.value)
        .join("")
        .replace(/ /g, " "),
    );
  }
  return pieces.join(", ");
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The wall-clock reading in the admin zone, as a UTC-based millisecond count. */
function wallClockAsUtc(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
}

function offsetAt(ms: number): number {
  return wallClockAsUtc(ms) - Math.floor(ms / 1000) * 1000;
}

/**
 * Turns a datetime-local value ("2027-06-12T16:00", no zone) typed in the
 * admin zone into the exact moment as an ISO string. Empty gives null. A time
 * skipped by a clock change gives an error object; a time that happens twice
 * gives the first occurrence.
 */
export function pacificLocalToIso(local: string): string | TimeError | null {
  if (!local) return null;
  const match = LOCAL_PATTERN.exec(local);
  if (!match) return { error: "Enter a date and time." };
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(asUtc) || new Date(asUtc).getUTCMonth() !== mo - 1) {
    return { error: "Enter a date and time." };
  }

  const day = 24 * 60 * 60 * 1000;
  const offsets = new Set([offsetAt(asUtc - day), offsetAt(asUtc + day)]);
  const matches = [...offsets]
    .map((offset) => asUtc - offset)
    .filter((candidate) => wallClockAsUtc(candidate) === asUtc)
    .sort((a, b) => a - b);

  if (matches.length === 0) return { error: SKIPPED_TIME_MESSAGE };
  return new Date(matches[0]).toISOString();
}

/** The datetime-local value ("2027-06-12T16:00") for a stored moment. */
export function isoToPacificLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return "";
  const wall = new Date(wallClockAsUtc(moment.getTime()));
  return wall.toISOString().slice(0, 16);
}
