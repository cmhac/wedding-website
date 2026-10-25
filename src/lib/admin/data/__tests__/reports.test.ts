/** @jest-environment node */
import { createAdminFakeDb } from "../../__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import {
  loadDietaryList,
  loadDishTotals,
  loadEventOptions,
  loadMealConflicts,
} from "../reports";

const asClient = (db: ReturnType<typeof createAdminFakeDb>) => db as never;

const dishRow = (over: Record<string, unknown>) => ({
  event_slug: "ceremony",
  course_id: "c-main",
  course_name: "Main",
  course_display_order: 2,
  dish_id: "d-1",
  dish_name: "Grilled salmon",
  chosen_count: 3,
  not_yet_chosen: false,
  ...over,
});

describe("loadDishTotals", () => {
  it("groups by course display order with Not yet chosen last in each course", async () => {
    const db = createAdminFakeDb({
      dish_totals: [
        dishRow({
          course_id: "c-main",
          dish_id: null,
          dish_name: null,
          chosen_count: 4,
          not_yet_chosen: true,
        }),
        dishRow({ course_id: "c-main", dish_id: "d-2", dish_name: "Risotto" }),
        dishRow({
          course_id: "c-dessert",
          course_name: "Dessert",
          course_display_order: 3,
          dish_id: "d-9",
          dish_name: "Lemon tart",
        }),
        dishRow({
          course_id: "c-starter",
          course_name: "Starter",
          course_display_order: 1,
          dish_id: "d-5",
          dish_name: "Soup",
        }),
        dishRow({ course_id: "c-main", dish_id: "d-1" }),
        dishRow({ event_slug: "other", dish_id: "d-x", dish_name: "Other" }),
      ],
    });
    const rows = await loadDishTotals(asClient(db), "ceremony");
    expect(rows.map((r) => [r.courseName, r.dishName])).toEqual([
      ["Starter", "Soup"],
      ["Main", "Grilled salmon"],
      ["Main", "Risotto"],
      ["Main", "Not yet chosen"],
      ["Dessert", "Lemon tart"],
    ]);
    const last = rows[3];
    expect(last).toMatchObject({ notYetChosen: true, chosenCount: 4 });
    expect(rows[1]).toMatchObject({ notYetChosen: false, chosenCount: 3 });
  });

  it("returns an empty list for an unknown event", async () => {
    const db = createAdminFakeDb({ dish_totals: [dishRow({})] });
    expect(await loadDishTotals(asClient(db), "nope")).toEqual([]);
  });

  it("throws when the read fails", async () => {
    const db = createAdminFakeDb({});
    db.failNext("dish_totals", { message: "boom" });
    await expect(loadDishTotals(asClient(db), "ceremony")).rejects.toThrow();
  });
});

describe("loadDietaryList", () => {
  it("returns guest, household, restriction label, severity and notes", async () => {
    const db = createAdminFakeDb({
      dietary_list: [
        {
          event_slug: "ceremony",
          guest_id: "g-1",
          guest_name: "Alex Example",
          household_name: "The Examples",
          category_label: "Tree nuts",
          severity: "allergy",
          details: "Carries an EpiPen",
          dietary_notes: null,
        },
        {
          event_slug: "ceremony",
          guest_id: "g-2",
          guest_name: "Sam Example",
          household_name: "The Examples",
          category_label: null,
          severity: null,
          details: null,
          dietary_notes: "No pork",
        },
        {
          event_slug: "party",
          guest_id: "g-3",
          guest_name: "Else",
          household_name: "Else",
          category_label: "Vegan",
          severity: "preference",
        },
      ],
    });
    const rows = await loadDietaryList(asClient(db), "ceremony");
    expect(rows).toEqual([
      {
        guestId: "g-1",
        guestName: "Alex Example",
        householdName: "The Examples",
        restriction: "Tree nuts",
        severity: "allergy",
        notes: "Carries an EpiPen",
      },
      {
        guestId: "g-2",
        guestName: "Sam Example",
        householdName: "The Examples",
        restriction: null,
        severity: null,
        notes: "No pork",
      },
    ]);
  });

  it("returns an empty list for an unknown event", async () => {
    expect(await loadDietaryList(asClient(createAdminFakeDb({})), "x")).toEqual(
      [],
    );
  });
});

describe("loadMealConflicts", () => {
  const conflict = {
    event_slug: "ceremony",
    course_id: "c-main",
    course_name: "Main",
    guest_id: "g-1",
    household_id: "h-1",
    guest_name: "Alex Example",
    household_name: "The Examples",
    dish_id: "d-chicken",
    dish_name: "Herb-crusted chicken",
    category_key: "tree_nuts",
    kind: "allergen",
    severity: "allergy",
  };

  function dbWith(history: Record<string, unknown>[]) {
    return createAdminFakeDb({
      meal_conflicts: [conflict, { ...conflict, event_slug: "party" }],
      dietary_categories: [{ key: "tree_nuts", label: "Tree nuts" }],
      meal_selection_history: history,
      households: [{ id: "h-1", auth_user_id: "u-household" }],
      staff: [{ user_id: "u-hannah", display_name: "Hannah" }],
    });
  }

  it("shows who made the choice from the newest matching history row", async () => {
    const db = dbWith([
      {
        id: 1,
        guest_id: "g-1",
        course_id: "c-main",
        new_dish_id: "d-chicken",
        actor_kind: "guest",
        changed_by: "u-household",
        changed_at: "2026-10-01T10:00:00Z",
      },
      {
        id: 2,
        guest_id: "g-1",
        course_id: "c-main",
        new_dish_id: "d-chicken",
        actor_kind: "couple",
        changed_by: "u-hannah",
        changed_at: "2026-10-02T10:00:00Z",
      },
      {
        id: 3,
        guest_id: "g-1",
        course_id: "c-other",
        new_dish_id: "d-chicken",
        actor_kind: "system",
        changed_by: null,
        changed_at: "2026-10-05T10:00:00Z",
      },
    ]);
    const rows = await loadMealConflicts(asClient(db), "ceremony");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      guestName: "Alex Example",
      householdName: "The Examples",
      courseName: "Main",
      dishName: "Herb-crusted chicken",
      conflictsWith: "Tree nuts",
      severity: "allergy",
      answeredBy: {
        kind: "staff",
        name: "Hannah",
        at: "2026-10-02T10:00:00Z",
      },
    });
  });

  it("uses the account comparison for a row with an empty actor_kind", async () => {
    const db = dbWith([
      {
        id: 1,
        guest_id: "g-1",
        course_id: "c-main",
        new_dish_id: "d-chicken",
        actor_kind: null,
        changed_by: "u-household",
        changed_at: "2026-10-01T10:00:00Z",
      },
    ]);
    const rows = await loadMealConflicts(asClient(db), "ceremony");
    expect(rows[0].answeredBy.kind).toBe("guest");
  });

  it("shows not answered when there is no matching history", async () => {
    const rows = await loadMealConflicts(asClient(dbWith([])), "ceremony");
    expect(rows[0].answeredBy.kind).toBe("not_answered");
  });

  it("returns an empty list for an unknown event", async () => {
    expect(await loadMealConflicts(asClient(dbWith([])), "nope")).toEqual([]);
  });
});

describe("loadEventOptions", () => {
  it("lists events by display order", async () => {
    const db = createAdminFakeDb({
      events: [
        { slug: "party", name: "Welcome party", display_order: 2 },
        { slug: "ceremony", name: "Ceremony", display_order: 1 },
      ],
    });
    expect(await loadEventOptions(asClient(db))).toEqual([
      { slug: "ceremony", name: "Ceremony" },
      { slug: "party", name: "Welcome party" },
    ]);
  });
});
