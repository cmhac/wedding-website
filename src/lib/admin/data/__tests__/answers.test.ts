/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import { loadHouseholdAnswers } from "../answers";

const asClient = (db: ReturnType<typeof createAdminFakeDb>) =>
  db as unknown as SupabaseClient;

const base = {
  staff_households: [
    { id: "h1", display_name: "The Examples", auth_user_id: "u-house" },
    { id: "h2", display_name: "Other", auth_user_id: "u-other" },
  ],
  staff_guests: [
    { id: "g1", household_id: "h1", first_name: "Sam", last_name: "Example" },
    { id: "g2", household_id: "h1", first_name: "Alex", last_name: "Example" },
    { id: "g9", household_id: "h2", first_name: "Else", last_name: "Where" },
  ],
  staff_invitations: [
    { guest_id: "g1", event_id: "e1", status: "attending" },
    { guest_id: "g2", event_id: "e1", status: "declined" },
    { guest_id: "g1", event_id: "e2", status: "pending" },
    { guest_id: "g9", event_id: "e1", status: "attending" },
  ],
};

const tables = {
  events: [
    { id: "e1", slug: "ceremony", name: "Ceremony", display_order: 2 },
    { id: "e2", slug: "welcome", name: "Welcome party", display_order: 1 },
  ],
  staff: [{ user_id: "u-hannah", display_name: "Hannah" }],
  rsvp_history: [
    {
      id: 1,
      guest_id: "g1",
      event_id: "e1",
      new_status: "attending",
      actor_kind: "couple",
      changed_by: "u-hannah",
      changed_at: "2026-10-03T21:14:00Z",
    },
    {
      id: 2,
      guest_id: "g2",
      event_id: "e1",
      new_status: "declined",
      actor_kind: "guest",
      changed_by: "u-house",
      changed_at: "2026-09-28T16:03:00Z",
    },
  ],
  menus: [
    { id: "m1", event_id: "e1", status: "published" },
    { id: "m2", event_id: "e2", status: "draft" },
  ],
  courses: [
    { id: "c-dessert", menu_id: "m1", name: "Dessert", display_order: 2 },
    { id: "c-main", menu_id: "m1", name: "Main", display_order: 1 },
    { id: "c-draft", menu_id: "m2", name: "Canapes", display_order: 1 },
  ],
  dishes: [
    {
      id: "d-risotto",
      course_id: "c-main",
      name: "Mushroom risotto",
      archived_at: null,
    },
    {
      id: "d-salmon",
      course_id: "c-main",
      name: "Grilled salmon",
      archived_at: null,
    },
    {
      id: "d-old",
      course_id: "c-main",
      name: "Old dish",
      archived_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "d-tart",
      course_id: "c-dessert",
      name: "Lemon tart",
      archived_at: null,
    },
    { id: "d-canape", course_id: "c-draft", name: "Canape", archived_at: null },
  ],
  meal_selections: [
    { guest_id: "g1", course_id: "c-main", dish_id: "d-risotto" },
    { guest_id: "g1", course_id: "c-dessert", dish_id: "d-tart" },
  ],
  meal_selection_history: [
    {
      id: 1,
      guest_id: "g1",
      course_id: "c-main",
      new_dish_id: "d-risotto",
      actor_kind: "guest",
      changed_by: "u-house",
      changed_at: "2026-09-28T16:00:00Z",
    },
    {
      id: 2,
      guest_id: "g1",
      course_id: "c-dessert",
      new_dish_id: "d-tart",
      actor_kind: "planner",
      changed_by: "u-hannah",
      changed_at: "2026-10-03T21:15:00Z",
    },
  ],
};

function setup(extra: Record<string, unknown[]> = {}) {
  return createAdminFakeDb({ ...tables, ...extra } as never, {
    rpcResults: {
      staff_households: { data: base.staff_households },
      staff_guests: { data: base.staff_guests },
      staff_invitations: { data: base.staff_invitations },
    },
  });
}

describe("loadHouseholdAnswers", () => {
  it("returns one row per guest per invited event for this household only, by event order then guest", async () => {
    const rows = await loadHouseholdAnswers("h1", asClient(setup()));
    expect(rows.map((r) => [r.eventName, r.guestName, r.status])).toEqual([
      ["Welcome party", "Sam Example", "pending"],
      ["Ceremony", "Alex Example", "declined"],
      ["Ceremony", "Sam Example", "attending"],
    ]);
  });

  it("attributes the RSVP using history and the staff list, with the time in Pacific", async () => {
    const rows = await loadHouseholdAnswers("h1", asClient(setup()));
    const sam = rows.find((r) => r.guestId === "g1" && r.eventId === "e1")!;
    expect(sam.answeredBy).toEqual({
      kind: "staff",
      name: "Hannah",
      at: "2026-10-03T21:14:00Z",
    });
    expect(sam.answeredAt).toBe("Oct 3, 2:14 PM PT");
    const alex = rows.find((r) => r.guestId === "g2")!;
    expect(alex.answeredBy.kind).toBe("guest");
    expect(alex.answeredAt).toBe("Sep 28, 9:03 AM PT");
  });

  it("shows an unanswered invitation as not answered with no time", async () => {
    const rows = await loadHouseholdAnswers("h1", asClient(setup()));
    const welcome = rows.find((r) => r.eventId === "e2")!;
    expect(welcome.answeredBy).toEqual({ kind: "not_answered" });
    expect(welcome.answeredAt).toBeNull();
  });

  it("lists each course of a published menu with the choice, its own source, and the dishes that can be picked", async () => {
    const rows = await loadHouseholdAnswers("h1", asClient(setup()));
    const sam = rows.find((r) => r.guestId === "g1" && r.eventId === "e1")!;
    expect(sam.meals.map((m) => m.courseName)).toEqual(["Main", "Dessert"]);
    const [main, dessert] = sam.meals;
    expect(main).toMatchObject({
      courseId: "c-main",
      dishId: "d-risotto",
      dishName: "Mushroom risotto",
    });
    expect(main.answeredBy.kind).toBe("guest");
    expect(main.options).toEqual([
      { id: "d-risotto", name: "Mushroom risotto" },
      { id: "d-salmon", name: "Grilled salmon" },
    ]);
    expect(dessert.answeredBy).toMatchObject({ kind: "staff", name: "Hannah" });
  });

  it("shows a course with no choice yet as not chosen", async () => {
    const rows = await loadHouseholdAnswers("h1", asClient(setup()));
    const alex = rows.find((r) => r.guestId === "g2")!;
    expect(alex.meals[0]).toMatchObject({
      dishId: null,
      dishName: null,
      answeredBy: { kind: "not_answered" },
    });
  });

  it("leaves out courses of draft menus", async () => {
    const rows = await loadHouseholdAnswers("h1", asClient(setup()));
    const welcome = rows.find((r) => r.eventId === "e2")!;
    expect(welcome.meals).toEqual([]);
  });

  it("includes closed menus", async () => {
    const db = setup({
      menus: [
        { id: "m1", event_id: "e1", status: "closed" },
        { id: "m2", event_id: "e2", status: "draft" },
      ],
    });
    const rows = await loadHouseholdAnswers("h1", asClient(db));
    expect(rows.find((r) => r.eventId === "e1")!.meals).toHaveLength(2);
  });

  it("reads old meal history without a kind by comparing with the household account", async () => {
    const db = setup({
      meal_selection_history: [
        {
          id: 1,
          guest_id: "g1",
          course_id: "c-main",
          new_dish_id: "d-risotto",
          actor_kind: null,
          changed_by: "u-house",
          changed_at: "2026-09-28T16:00:00Z",
        },
      ],
    });
    const rows = await loadHouseholdAnswers("h1", asClient(db));
    const sam = rows.find((r) => r.guestId === "g1" && r.eventId === "e1")!;
    expect(sam.meals[0].answeredBy.kind).toBe("guest");
  });

  it("returns nothing for an unknown household", async () => {
    expect(await loadHouseholdAnswers("nope", asClient(setup()))).toEqual([]);
  });

  it("throws when a read fails", async () => {
    const db = setup();
    db.failNext("rsvp_history", { message: "boom" });
    await expect(loadHouseholdAnswers("h1", asClient(db))).rejects.toThrow();
  });
});
