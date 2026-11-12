import {
  compactDate,
  entryDescription,
  nextDay,
  type CalendarEntry,
} from "./ics";

/**
 * Links that open a prefilled new all-day entry (contracts/calendar.md). Both
 * formats are documented by the community rather than the vendors, so the
 * Outlook address is one constant: it has changed before.
 */

export const GOOGLE_RENDER_URL = "https://calendar.google.com/calendar/render";
export const OUTLOOK_COMPOSE_URL =
  "https://outlook.live.com/calendar/0/deeplink/compose";

function build(base: string, params: [string, string | null][]): string {
  const url = new URL(base);
  for (const [key, value] of params) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function googleCalendarUrl(entry: CalendarEntry): string {
  return build(GOOGLE_RENDER_URL, [
    ["action", "TEMPLATE"],
    ["text", entry.title],
    ["dates", `${compactDate(entry.date)}/${compactDate(nextDay(entry.date))}`],
    ["details", entryDescription(entry)],
    ["location", entry.place],
  ]);
}

export function outlookCalendarUrl(entry: CalendarEntry): string {
  return build(OUTLOOK_COMPOSE_URL, [
    ["path", "/calendar/action/compose"],
    ["rru", "addevent"],
    ["subject", entry.title],
    ["startdt", entry.date],
    ["enddt", nextDay(entry.date)],
    ["allday", "true"],
    ["body", entryDescription(entry)],
    ["location", entry.place],
  ]);
}
