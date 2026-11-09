/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import { loadOverview } from "../overview";

const events = [
  {
    id: "e3",
    slug: "ceremony",
    name: "Ceremony",
    is_required: true,
    display_order: 3,
  },
  {
    id: "e1",
    slug: "welcome-party",
    name: "Welcome party",
    is_required: false,
    display_order: 1,
  },
  {
    id: "e2",
    slug: "rehearsal",
    name: "Rehearsal",
    is_required: false,
    display_order: 2,
  },
];

const eventCounts = [
  {
    event_id: "e3",
    slug: "ceremony",
    name: "Ceremony",
    invited: 10,
    attending: 6,
    declined: 1,
    pending: 3,
  },
  {
    event_id: "e1",
    slug: "welcome-party",
    name: "Welcome party",
    invited: 8,
    attending: 4,
    declined: 2,
    pending: 2,
  },
  {
    event_id: "e2",
    slug: "rehearsal",
    name: "Rehearsal",
    invited: 4,
    attending: 1,
    declined: 0,
    pending: 3,
  },
];

const progress = [
  {
    household_id: "h1",
    display_name: "The Examples",
    pending_required: 2,
    pending_optional: 2,
    pending_meals: 2,
  },
  {
    household_id: "h2",
    display_name: "Sample Family",
    pending_required: 0,
    pending_optional: 1,
    pending_meals: 3,
  },
  {
    household_id: "h3",
    display_name: "Exampleton Family",
    pending_required: 3,
    pending_optional: 0,
    pending_meals: 0,
  },
  {
    household_id: "h4",
    display_name: "Done Household",
    pending_required: 0,
    pending_optional: 0,
    pending_meals: 0,
  },
  {
    household_id: "h5",
    display_name: "Tiny Household",
    pending_required: 0,
    pending_optional: 0,
    pending_meals: 1,
  },
];

const households = [
  {
    id: "h1",
    display_name: "The Examples",
    delivery_problem: false,
  },
  {
    id: "h2",
    display_name: "Sample Family",
    delivery_problem: true,
  },
  {
    id: "h3",
    display_name: "Exampleton Family",
    delivery_problem: true,
  },
  {
    id: "h4",
    display_name: "Done Household",
    delivery_problem: false,
  },
  {
    id: "h5",
    display_name: "Tiny Household",
    delivery_problem: false,
  },
];

function makeDb(overrides: Record<string, unknown[]> = {}) {
  return createAdminFakeDb(
    {
      events,
      event_counts: eventCounts,
      household_rsvp_progress: progress,
      // h3 and h4 have no address: they need paper.
      household_contacts: [
        { id: "c1", household_id: "h1", value: "a@example.test" },
        { id: "c2", household_id: "h1", value: "a2@example.test" },
        { id: "c3", household_id: "h2", value: "b@example.test" },
        { id: "c4", household_id: "h5", value: "e@example.test" },
      ],
      settings: [
        {
          id: true,
          rsvp_open: true,
          default_rsvp_deadline: "2027-09-02T06:59:00Z",
          wedding_event_id: "e-ceremony",
        },
      ],
      ...overrides,
    } as never,
    {
      rpcs: {
        staff_households: () => households,
        find_duplicate_households: () => [
          { household_a: "h1", household_b: "h2", reasons: ["display_name"] },
          { household_a: "h2", household_b: "h3", reasons: ["address"] },
        ],
      },
    },
  );
}

const load = (db = makeDb()) => loadOverview(db as unknown as SupabaseClient);

describe("loadOverview", () => {
  it("returns per-event counts in display order", async () => {
    const data = await load();
    expect(data.events.map((e) => e.slug)).toEqual([
      "welcome-party",
      "rehearsal",
      "ceremony",
    ]);
    expect(data.events[2]).toMatchObject({
      name: "Ceremony",
      isRequired: true,
      invited: 10,
      attending: 6,
      declined: 1,
      pending: 3,
    });
    expect(data.events[0].isRequired).toBe(false);
  });

  it("counts households with outstanding required, optional and meal answers", async () => {
    const data = await load();
    expect(data.requiredOutstanding).toBe(2);
    expect(data.optionalOutstanding).toBe(2);
    expect(data.mealsOutstanding).toBe(3);
  });

  it("counts delivery problems, paper-only households and duplicate pairs", async () => {
    const data = await load();
    expect(data.deliveryProblems).toBe(2);
    expect(data.paperOnly).toBe(2); // households with no address
    expect(data.possibleDuplicates).toBe(2);
  });

  it("returns the household count and the ceremony's attending total", async () => {
    const data = await load();
    expect(data.householdCount).toBe(5);
    expect(data.ceremony).toEqual({ attending: 6, invited: 10 });
  });

  it("lists the three households with the most outstanding, most first", async () => {
    const data = await load();
    expect(data.mostOutstanding).toEqual([
      {
        householdId: "h1",
        name: "The Examples",
        required: 2,
        optional: 2,
        meals: 2,
      },
      {
        householdId: "h2",
        name: "Sample Family",
        required: 0,
        optional: 1,
        meals: 3,
      },
      {
        householdId: "h3",
        name: "Exampleton Family",
        required: 3,
        optional: 0,
        meals: 0,
      },
    ]);
  });

  it("leaves out households with nothing outstanding", async () => {
    const data = await load(
      makeDb({
        household_rsvp_progress: [progress[3]],
      }),
    );
    expect(data.mostOutstanding).toEqual([]);
  });

  it("reads whether RSVPs are open and the default deadline from settings", async () => {
    const data = await load();
    expect(data.rsvpOpen).toBe(true);
    expect(data.defaultDeadline).toBe("2027-09-02T06:59:00Z");
    const closed = await load(
      makeDb({
        settings: [{ id: true, rsvp_open: false, default_rsvp_deadline: null }],
      }),
    );
    expect(closed.rsvpOpen).toBe(false);
    expect(closed.defaultDeadline).toBeNull();
  });

  it("says whether a wedding event is chosen (personal links close on its date)", async () => {
    expect((await load()).weddingEventChosen).toBe(true);
    const none = await load(
      makeDb({
        settings: [
          {
            id: true,
            rsvp_open: true,
            default_rsvp_deadline: null,
            wedding_event_id: null,
          },
        ],
      }),
    );
    expect(none.weddingEventChosen).toBe(false);
  });

  it("has no ceremony total when there is no ceremony event", async () => {
    const data = await load(makeDb({ events: [], event_counts: [] }));
    expect(data.events).toEqual([]);
    expect(data.ceremony).toBeNull();
  });

  it("fails with a plain error, not raw database text, when a read fails", async () => {
    const db = makeDb();
    db.failNext("event_counts", { message: "secret internals" });
    await expect(load(db)).rejects.toThrow("overview_load_failed");
  });
});
