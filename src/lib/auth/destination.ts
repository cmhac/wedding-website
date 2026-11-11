/**
 * Where a personal link lands depends on the message it arrived in (research
 * R1). The household stores nothing: the link in a save the date message
 * carries `?next=/save-the-date`, which the personal-link route honors only
 * because `allowedNext` lists the path. Every other message type keeps the
 * default landing.
 */

export const SAVE_THE_DATE_PATH = "/save-the-date";

const DESTINATIONS: Record<string, string> = {
  save_the_date: SAVE_THE_DATE_PATH,
};

/** The landing path for a message type, or null for the default landing. */
export function destinationFor(
  messageTypeKey: string | null | undefined,
): string | null {
  if (!messageTypeKey) return null;
  return Object.prototype.hasOwnProperty.call(DESTINATIONS, messageTypeKey)
    ? DESTINATIONS[messageTypeKey]
    : null;
}

/** Adds the landing to a personal link; no-op without one or if already there. */
export function withDestination(link: string, path: string | null): string {
  if (!path || link.includes("?next=")) return link;
  return `${link}?next=${path}`;
}
