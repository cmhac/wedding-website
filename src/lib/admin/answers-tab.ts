/**
 * Works out what the Answers tab needs besides the answer rows: every guest
 * id in the household, and the events the household is not invited to yet.
 */
export function answersTabProps({
  rows,
  guests,
  events,
}: {
  rows: { eventId: string }[];
  guests: { id: string }[];
  events: { id: string; name: string }[];
}) {
  const invited = new Set(rows.map((row) => row.eventId));
  return {
    guestIds: guests.map((guest) => guest.id),
    otherEvents: events
      .filter((event) => !invited.has(event.id))
      .map(({ id, name }) => ({ id, name })),
  };
}
