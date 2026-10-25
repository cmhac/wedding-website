/** @jest-environment node */
import { createAdminFakeDb } from "../../__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: jest.fn(),
}));

import { loadDietaryCategories, loadMenu, loadMenuEvents } from "../menus";

const EVENT = "e0000000-0000-4000-8000-000000000001";
const MENU = "m0000000-0000-4000-8000-000000000001";

function seed() {
  return createAdminFakeDb({
    events: [
      { id: EVENT, slug: "wedding", name: "Wedding", display_order: 2 },
      { id: "e2", slug: "welcome", name: "Welcome party", display_order: 1 },
      { id: "e3", slug: "rehearsal", name: "Rehearsal", display_order: 3 },
    ],
    menus: [{ id: MENU, event_id: EVENT, status: "published" }],
    courses: [
      {
        id: "c2",
        menu_id: MENU,
        name: "Dessert",
        display_order: 2,
        requires_choice: false,
      },
      {
        id: "c1",
        menu_id: MENU,
        name: "Main",
        display_order: 1,
        requires_choice: true,
      },
      { id: "c-other", menu_id: "other-menu", name: "Elsewhere" },
    ],
    dishes: [
      {
        id: "d1",
        course_id: "c1",
        name: "Mushroom risotto",
        description: "Herbs",
        archived_at: null,
      },
      {
        id: "d2",
        course_id: "c1",
        name: "Beef short rib",
        description: null,
        archived_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "d3",
        course_id: "c2",
        name: "Lemon tart",
        description: null,
        archived_at: null,
      },
    ],
    dietary_categories: [
      { key: "nuts", label: "Tree nuts", kind: "allergen", display_order: 10 },
      {
        key: "vegetarian",
        label: "Vegetarian",
        kind: "diet",
        display_order: 1,
      },
    ],
    dish_tags: [
      { dish_id: "d1", category_key: "vegetarian" },
      { dish_id: "d1", category_key: "nuts" },
    ],
    dish_totals: [
      {
        event_id: EVENT,
        course_id: "c1",
        dish_id: "d1",
        chosen_count: 24,
        not_yet_chosen: false,
      },
      {
        event_id: EVENT,
        course_id: "c1",
        dish_id: null,
        chosen_count: 7,
        not_yet_chosen: true,
      },
      {
        event_id: EVENT,
        course_id: "c2",
        dish_id: "d3",
        chosen_count: 3,
        not_yet_chosen: false,
      },
    ],
  });
}

describe("loadMenu", () => {
  it("returns status, courses in order, dishes with tags and chosen counts", async () => {
    const menu = await loadMenu("wedding", seed() as never);
    expect(menu).not.toBeNull();
    expect(menu?.event).toEqual({
      id: EVENT,
      slug: "wedding",
      name: "Wedding",
    });
    expect(menu?.menu?.status).toBe("published");
    expect(menu?.menu?.courses.map((c) => c.name)).toEqual(["Main", "Dessert"]);
    const [main, dessert] = menu?.menu?.courses ?? [];
    expect(main.requiresChoice).toBe(true);
    expect(dessert.requiresChoice).toBe(false);

    const risotto = main.dishes.find((d) => d.id === "d1");
    expect(risotto).toMatchObject({
      name: "Mushroom risotto",
      description: "Herbs",
      archivedAt: null,
      chosenCount: 24,
    });
    expect(risotto?.tags).toEqual([
      {
        key: "vegetarian",
        label: "Vegetarian",
        kind: "diet",
        meaning: "suitable for",
      },
      {
        key: "nuts",
        label: "Tree nuts",
        kind: "allergen",
        meaning: "contains",
      },
    ]);
    expect(dessert.dishes[0].chosenCount).toBe(3);
  });

  it("keeps archived dishes, with a chosen count of zero", async () => {
    const menu = await loadMenu("wedding", seed() as never);
    const rib = menu?.menu?.courses[0].dishes.find((d) => d.id === "d2");
    expect(rib?.archivedAt).toBe("2026-10-01T00:00:00Z");
    expect(rib?.chosenCount).toBe(0);
  });

  it("returns a null menu and a flag for an event with no menu", async () => {
    const menu = await loadMenu("welcome", seed() as never);
    expect(menu).toEqual({
      event: { id: "e2", slug: "welcome", name: "Welcome party" },
      menu: null,
      hasMenu: false,
    });
  });

  it("returns null for an event that does not exist", async () => {
    expect(await loadMenu("nope", seed() as never)).toBeNull();
  });
});

describe("loadMenuEvents", () => {
  it("lists events in display order", async () => {
    const events = await loadMenuEvents(seed() as never);
    expect(events.map((e) => e.slug)).toEqual([
      "welcome",
      "wedding",
      "rehearsal",
    ]);
    expect(events[0]).toEqual({
      id: "e2",
      slug: "welcome",
      name: "Welcome party",
    });
  });
});

describe("loadDietaryCategories", () => {
  it("returns key, label, kind and order, in order", async () => {
    expect(await loadDietaryCategories(seed() as never)).toEqual([
      { key: "vegetarian", label: "Vegetarian", kind: "diet", displayOrder: 1 },
      { key: "nuts", label: "Tree nuts", kind: "allergen", displayOrder: 10 },
    ]);
  });
});
