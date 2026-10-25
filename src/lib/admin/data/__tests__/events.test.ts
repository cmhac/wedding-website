/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import { loadEvent, loadEvents, loadInvitableGuests } from "../events";

type Db = ReturnType<typeof createAdminFakeDb>;
const asClient = (db: Db) => db as unknown as SupabaseClient;

const events = [
  {
    id: "e3",
    slug: "ceremony",
    name: "Ceremony and reception",
    starts_at: "2027-06-12T23:00:00Z",
    venue_name: "Example Hall",
    is_required: true,
    group_key: "wedding-weekend",
    rsvp_deadline: "2027-05-02T06:59:00Z",
    display_order: 3,
  },
  {
    id: "e1",
    slug: "welcome-party",
    name: "Welcome party",
    starts_at: null,
    venue_name: null,
    is_required: false,
    group_key: null,
    rsvp_deadline: null,
    display_order: 1,
  },
];
const counts = [
  { event_id: "e3", invited: 142 },
  { event_id: "e1", invited: 96 },
];

describe("loadEvents", () => {
  it("returns events in display order with invited counts, Pacific times and Default deadlines", async () => {
    const db = createAdminFakeDb({ events, event_counts: counts });
    const rows = await loadEvents(asClient(db));
    expect(rows.map((r) => r.slug)).toEqual(["welcome-party", "ceremony"]);
    expect(rows[0]).toMatchObject({
      id: "e1",
      name: "Welcome party",
      invited: 96,
      startsAtText: "",
      startsAtLocal: "",
      venue: "",
      isRequired: false,
      groupKey: "",
      deadlineText: "Default",
      deadlineLocal: "",
      displayOrder: 1,
    });
    expect(rows[1]).toMatchObject({
      invited: 142,
      startsAtText: "Sat, Jun 12, 4:00 PM PT",
      startsAtLocal: "2027-06-12T16:00",
      venue: "Example Hall",
      isRequired: true,
      groupKey: "wedding-weekend",
      deadlineText: "May 1, 11:59 PM PT",
      deadlineLocal: "2027-05-01T23:59",
    });
  });

  it("counts an event with no counts row as zero invited", async () => {
    const db = createAdminFakeDb({ events, event_counts: [] });
    const rows = await loadEvents(asClient(db));
    expect(rows.every((r) => r.invited === 0)).toBe(true);
  });

  it("throws when events cannot be read", async () => {
    const db = createAdminFakeDb({ events, event_counts: counts });
    db.failNext("events", { message: "boom" });
    await expect(loadEvents(asClient(db))).rejects.toThrow();
  });
});

describe("loadEvent", () => {
  it("returns one event, or null when there is none", async () => {
    const db = createAdminFakeDb({ events, event_counts: counts });
    expect((await loadEvent("e3", asClient(db)))?.slug).toBe("ceremony");
    expect(await loadEvent("nope", asClient(db))).toBeNull();
  });
});

describe("loadInvitableGuests", () => {
  const households = [
    { id: "h1", display_name: "The Examples" },
    { id: "h2", display_name: "Exampleton family" },
  ];
  const guests = [
    {
      id: "g1",
      household_id: "h1",
      first_name: "Sam",
      last_name: "Example",
      is_placeholder: false,
    },
    {
      id: "g2",
      household_id: "h1",
      first_name: "Alex",
      last_name: "Example",
      is_placeholder: false,
    },
    {
      id: "g3",
      household_id: "h2",
      first_name: "José",
      last_name: "Exampleton",
      is_placeholder: false,
    },
    {
      id: "g4",
      household_id: "h2",
      first_name: null,
      last_name: null,
      is_placeholder: true,
    },
  ];
  const invitations = [
    { guest_id: "g1", event_id: "e3", status: "attending" },
    { guest_id: "g2", event_id: "e1", status: "pending" },
  ];
  const db = () =>
    createAdminFakeDb(
      {},
      {
        rpcResults: {
          staff_guests: { data: guests },
          staff_households: { data: households },
          staff_invitations: { data: invitations },
        },
      },
    );

  it("lists guests with their household names, sorted by household then name", async () => {
    const rows = await loadInvitableGuests("", undefined, asClient(db()));
    expect(rows.map((r) => [r.id, r.name, r.householdName])).toEqual([
      ["g3", "José Exampleton", "Exampleton family"],
      ["g4", "Unnamed plus-one", "Exampleton family"],
      ["g2", "Alex Example", "The Examples"],
      ["g1", "Sam Example", "The Examples"],
    ]);
  });

  it("searches guest and household names, ignoring capitals and accents", async () => {
    const byGuest = await loadInvitableGuests(
      "jose",
      undefined,
      asClient(db()),
    );
    expect(byGuest.map((r) => r.id)).toEqual(["g3"]);
    const byHousehold = await loadInvitableGuests(
      "THE EXAMPLES",
      undefined,
      asClient(db()),
    );
    expect(byHousehold.map((r) => r.id)).toEqual(["g2", "g1"]);
  });

  it("marks each guest's current invitation for the chosen event", async () => {
    const rows = await loadInvitableGuests("", "e3", asClient(db()));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.invitation]));
    expect(byId).toEqual({
      g1: { status: "attending" },
      g2: null,
      g3: null,
      g4: null,
    });
  });

  it("gives no invitation info when no event is chosen", async () => {
    const rows = await loadInvitableGuests("", undefined, asClient(db()));
    expect(rows.every((r) => r.invitation === null)).toBe(true);
  });
});
