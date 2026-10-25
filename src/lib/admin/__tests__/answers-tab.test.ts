import { answersTabProps } from "../answers-tab";

const rows = [
  { guestId: "g1", eventId: "e1" },
  { guestId: "g2", eventId: "e1" },
  { guestId: "g1", eventId: "e2" },
];
const events = [
  { id: "e1", name: "Ceremony" },
  { id: "e2", name: "Dinner" },
  { id: "e3", name: "Brunch" },
];

describe("answersTabProps", () => {
  it("lists only events the household has no invitation to", () => {
    const { otherEvents } = answersTabProps({
      rows,
      guests: [{ id: "g1" }],
      events,
    });
    expect(otherEvents).toEqual([{ id: "e3", name: "Brunch" }]);
  });

  it("returns every guest id, including guests with no invitations", () => {
    const { guestIds } = answersTabProps({
      rows,
      guests: [{ id: "g1" }, { id: "g2" }, { id: "g3" }],
      events,
    });
    expect(guestIds).toEqual(["g1", "g2", "g3"]);
  });

  it("offers every event when there are no rows", () => {
    const { otherEvents } = answersTabProps({
      rows: [],
      guests: [],
      events,
    });
    expect(otherEvents).toHaveLength(3);
  });
});
