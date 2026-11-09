/** Small date helpers shared by the first-draft email templates. Times are Pacific. */

const ZONE = "America/Los_Angeles";

export function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("en-US", {
    timeZone: ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} at ${time} PT`;
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    timeZone: ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
