import { googleCalendarUrl, outlookCalendarUrl } from "./links";
import { nextDay, type CalendarEntry } from "./ics";

/**
 * The save the date details as every surface uses them: the guest endpoint,
 * the placeholder page, the calendar file and the preview. One shape, built
 * from the result of the `get_save_the_date` database function, so the page,
 * the email, the text and the calendar entry cannot disagree.
 */

export const CALENDAR_FILE_PATH = "/api/guest/save-the-date/calendar";

export type SaveTheDate = {
  couple_names: string | null;
  /** `YYYY-MM-DD`, or null when the wedding date is not set. */
  date: string | null;
  place: string | null;
  note: string | null;
  revision: number;
  /** Null when there is no date: no wrong entry is ever produced. */
  calendar: { google: string; outlook: string; file: string } | null;
};

export function eventTitle(coupleNames: string | null | undefined): string {
  const names = coupleNames?.trim();
  return names ? `${names}'s wedding` : "Our wedding";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    nextDay(value);
    return value;
  } catch {
    return null;
  }
}

/** The calendar entry for these details, or null while there is no date. */
export function entryFor(
  details: Pick<
    SaveTheDate,
    "couple_names" | "date" | "place" | "note" | "revision"
  >,
  siteUrl: string,
): CalendarEntry | null {
  if (!details.date) return null;
  return {
    date: details.date,
    title: eventTitle(details.couple_names),
    place: details.place,
    note: details.note,
    siteUrl: siteUrl.replace(/\/+$/, ""),
    revision: details.revision,
  };
}

export function shapeSaveTheDate(raw: unknown, siteUrl: string): SaveTheDate {
  const row =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const revision =
    typeof row.revision === "number" && Number.isFinite(row.revision)
      ? Math.max(1, Math.trunc(row.revision))
      : 1;
  const base = {
    couple_names: text(row.couple_names),
    date: validDate(row.date),
    place: text(row.place),
    note: text(row.note),
    revision,
  };
  const entry = entryFor(base, siteUrl);
  return {
    ...base,
    calendar: entry
      ? {
          google: googleCalendarUrl(entry),
          outlook: outlookCalendarUrl(entry),
          file: CALENDAR_FILE_PATH,
        }
      : null,
  };
}
