/** @jest-environment node */
import { createAdminFakeDb } from "../../__tests__/fixtures/fake-db";
import { messageFor } from "@/lib/admin/messages";

jest.mock("server-only", () => ({}), { virtual: true });

const revalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("redirect"), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
    });
  },
}));
jest.mock("@/lib/log", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let current: unknown;
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => current,
}));

import {
  archiveDish,
  restoreDish,
  saveCategory,
  saveCourse,
  saveDish,
  setMenuStatus,
} from "../menus";

const EVENT = "e0000000-0000-4000-8000-000000000001";
const OTHER_EVENT = "e0000000-0000-4000-8000-000000000002";
const MENU = "a0000000-0000-4000-8000-000000000001";
const OTHER_MENU = "a0000000-0000-4000-8000-000000000002";
const COURSE = "c0000000-0000-4000-8000-000000000001";
const OTHER_COURSE = "c0000000-0000-4000-8000-000000000002";
const DISH = "d0000000-0000-4000-8000-000000000001";

type Rpcs = Parameters<typeof createAdminFakeDb>[1];

function setup(
  extra: Record<string, Record<string, unknown>[]> = {},
  options: Rpcs = {},
  signedIn = true,
) {
  const db = createAdminFakeDb(
    {
      staff: [{ user_id: "u1", role: "planner" }],
      events: [
        { id: EVENT, slug: "wedding" },
        { id: OTHER_EVENT, slug: "rehearsal" },
      ],
      menus: [
        { id: MENU, event_id: EVENT, status: "draft" },
        { id: OTHER_MENU, event_id: OTHER_EVENT, status: "draft" },
      ],
      courses: [
        { id: COURSE, menu_id: MENU, name: "Main" },
        { id: OTHER_COURSE, menu_id: OTHER_MENU, name: "Other" },
      ],
      dishes: [
        { id: DISH, course_id: COURSE, name: "Risotto", archived_at: null },
      ],
      dietary_categories: [
        {
          key: "vegetarian",
          label: "Vegetarian",
          kind: "diet",
          display_order: 1,
        },
      ],
      ...extra,
    },
    options,
  );
  current = Object.assign(Object.create(db), {
    auth: {
      getUser: async () => ({
        data: { user: signedIn ? { id: "u1" } : null },
        error: null,
      }),
    },
  });
  return db;
}

function form(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw e;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => revalidatePath.mockClear());

describe("setMenuStatus", () => {
  it.each(["draft", "published", "closed"])("accepts %s", async (status) => {
    const db = setup();
    const result = await setMenuStatus(
      null,
      form([
        ["event_id", EVENT],
        ["status", status],
      ]),
    );
    expect(result.ok).toBe(true);
    expect(db.tables.menus.find((m) => m.id === MENU)?.status).toBe(status);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/menus");
  });

  it("refuses any other status", async () => {
    const db = setup();
    const result = await setMenuStatus(
      null,
      form([
        ["event_id", EVENT],
        ["status", "open"],
      ]),
    );
    expect(result.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("creates the menu row when the event has none", async () => {
    const db = setup({ menus: [] });
    const result = await setMenuStatus(
      null,
      form([
        ["event_id", EVENT],
        ["status", "draft"],
      ]),
    );
    expect(result.ok).toBe(true);
    expect(db.tables.menus).toHaveLength(1);
    expect(db.tables.menus[0]).toMatchObject({
      event_id: EVENT,
      status: "draft",
    });
  });

  it("refuses a signed-out visitor", async () => {
    setup({}, {}, false);
    const result = await setMenuStatus(
      null,
      form([
        ["event_id", EVENT],
        ["status", "draft"],
      ]),
    );
    expect(result).toEqual({
      ok: false,
      message: messageFor("unauthenticated"),
    });
  });
});

describe("saveCourse", () => {
  const base: Array<[string, string]> = [
    ["menu_id", MENU],
    ["name", "Dessert"],
    ["display_order", "3"],
  ];

  it("requires a name and a whole-number order", async () => {
    const db = setup();
    const result = await saveCourse(
      null,
      form([
        ["menu_id", MENU],
        ["name", ""],
        ["display_order", "1.5"],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual([
      "display_order",
      "name",
    ]);
    expect(db.writes).toEqual([]);
  });

  it("refuses an empty order rather than treating it as zero", async () => {
    setup();
    const result = await saveCourse(
      null,
      form([
        ["menu_id", MENU],
        ["name", "Dessert"],
        ["display_order", ""],
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it("defaults requires_choice to true when the field is absent", async () => {
    const db = setup();
    expect((await saveCourse(null, form(base))).ok).toBe(true);
    expect(db.tables.courses.find((c) => c.name === "Dessert")).toMatchObject({
      menu_id: MENU,
      display_order: 3,
      requires_choice: true,
    });
  });

  it("reads an unchecked box (hidden false only) and a checked box (false then true)", async () => {
    const db = setup();
    await saveCourse(null, form([...base, ["requires_choice", "false"]]));
    expect(
      db.tables.courses.find((c) => c.name === "Dessert")?.requires_choice,
    ).toBe(false);
    await saveCourse(
      null,
      form([
        ["menu_id", MENU],
        ["name", "Starter"],
        ["display_order", "0"],
        ["requires_choice", "false"],
        ["requires_choice", "true"],
      ]),
    );
    expect(
      db.tables.courses.find((c) => c.name === "Starter")?.requires_choice,
    ).toBe(true);
  });

  it("updates an existing course when an id is given", async () => {
    const db = setup();
    await saveCourse(null, form([...base, ["id", COURSE]]));
    expect(db.tables.courses.find((c) => c.id === COURSE)).toMatchObject({
      name: "Dessert",
      display_order: 3,
    });
    expect(db.tables.courses).toHaveLength(2);
  });
});

describe("saveDish", () => {
  const base: Array<[string, string]> = [
    ["event_id", EVENT],
    ["course_id", COURSE],
    ["name", "Lemon tart"],
  ];

  it("requires a name; the description is optional", async () => {
    const db = setup();
    const bad = await saveDish(
      null,
      form([
        ["event_id", EVENT],
        ["course_id", COURSE],
        ["name", " "],
      ]),
    );
    expect(bad.ok).toBe(false);
    expect(await saveDish(null, form(base))).toEqual({ ok: true });
    expect(db.tables.dishes.find((d) => d.name === "Lemon tart")).toBeDefined();
  });

  it("saves the description and the checked tags", async () => {
    const db = setup();
    await saveDish(
      null,
      form([
        ...base,
        ["description", "Berries"],
        ["tags", "vegetarian"],
        ["tags", "nuts"],
      ]),
    );
    const dish = db.tables.dishes.find((d) => d.name === "Lemon tart");
    expect(dish).toMatchObject({ description: "Berries", course_id: COURSE });
    expect(
      db.tables.dish_tags
        .filter((t) => t.dish_id === dish?.id)
        .map((t) => t.category_key),
    ).toEqual(["vegetarian", "nuts"]);
  });

  it("replaces the whole tag set of an existing dish", async () => {
    const db = setup({
      dish_tags: [
        { dish_id: DISH, category_key: "nuts" },
        { dish_id: "someone-else", category_key: "nuts" },
      ],
    });
    await saveDish(
      null,
      form([
        ["event_id", EVENT],
        ["course_id", COURSE],
        ["id", DISH],
        ["name", "Risotto"],
        ["tags", "vegetarian"],
      ]),
    );
    expect(db.tables.dish_tags.filter((t) => t.dish_id === DISH)).toEqual([
      expect.objectContaining({ category_key: "vegetarian" }),
    ]);
    expect(
      db.tables.dish_tags.filter((t) => t.dish_id === "someone-else"),
    ).toHaveLength(1);
  });

  it("clears all tags when none are checked", async () => {
    const db = setup({ dish_tags: [{ dish_id: DISH, category_key: "nuts" }] });
    await saveDish(
      null,
      form([
        ["event_id", EVENT],
        ["course_id", COURSE],
        ["id", DISH],
        ["name", "Risotto"],
      ]),
    );
    expect(db.tables.dish_tags).toEqual([]);
  });

  it("refuses a course that belongs to another event", async () => {
    const db = setup();
    const result = await saveDish(
      null,
      form([
        ["event_id", EVENT],
        ["course_id", OTHER_COURSE],
        ["name", "Lemon tart"],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.course_id).toBe(
      "That course belongs to a different event.",
    );
    expect(db.tables.dishes).toHaveLength(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("archiveDish", () => {
  const entries: Array<[string, string]> = [
    ["event", "wedding"],
    ["dish_id", DISH],
  ];

  it("calls archive_dish and redirects with the guest and household counts", async () => {
    const db = setup(
      {},
      {
        rpcResults: {
          archive_dish: {
            data: [
              { guest_id: "g1", household_id: "h1" },
              { guest_id: "g2", household_id: "h1" },
              { guest_id: "g3", household_id: "h2" },
            ],
          },
        },
      },
    );
    const url = await redirectedTo(() => archiveDish(form(entries)));
    expect(db.rpcCalls).toEqual([
      { fn: "archive_dish", args: { dish_id: DISH } },
    ]);
    expect(url).toBe(
      "/admin/menus?event=wedding&tab=menu&archived=3&households=2",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/menus");
  });

  it("reports nobody to ask again when archived twice", async () => {
    setup({}, { rpcResults: { archive_dish: { data: [] } } });
    const url = await redirectedTo(() => archiveDish(form(entries)));
    expect(url).toBe(
      "/admin/menus?event=wedding&tab=menu&archived=0&households=0",
    );
  });

  it("redirects with an error code when the database refuses", async () => {
    setup(
      {},
      { rpcResults: { archive_dish: { error: { message: "not_found" } } } },
    );
    const url = await redirectedTo(() => archiveDish(form(entries)));
    expect(url).toBe("/admin/menus?event=wedding&tab=menu&error=not_found");
  });
});

describe("restoreDish", () => {
  it("clears archived_at and returns to the menu", async () => {
    const db = setup({
      dishes: [
        {
          id: DISH,
          course_id: COURSE,
          name: "Rib",
          archived_at: "2026-10-01T00:00:00Z",
        },
      ],
    });
    const url = await redirectedTo(() =>
      restoreDish(
        form([
          ["event", "wedding"],
          ["dish_id", DISH],
        ]),
      ),
    );
    expect(db.tables.dishes[0].archived_at).toBeNull();
    expect(url).toBe("/admin/menus?event=wedding&tab=menu");
  });
});

describe("saveCategory", () => {
  it("requires a label and a kind of diet or allergen", async () => {
    const db = setup();
    const result = await saveCategory(
      null,
      form([
        ["label", ""],
        ["kind", "other"],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual([
      "kind",
      "label",
    ]);
    expect(db.tables.dietary_categories).toHaveLength(1);
  });

  it("derives a lowercase hyphenated key", async () => {
    const db = setup();
    const result = await saveCategory(
      null,
      form([
        ["label", "  Sulphur  Dioxide! "],
        ["kind", "allergen"],
      ]),
    );
    expect(result.ok).toBe(true);
    expect(db.tables.dietary_categories.at(-1)).toMatchObject({
      key: "sulphur-dioxide",
      label: "Sulphur  Dioxide!".replace(/\s+/g, " "),
      kind: "allergen",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/menus");
  });

  it("refuses a label with no letters or digits", async () => {
    setup();
    const result = await saveCategory(
      null,
      form([
        ["label", "!!!"],
        ["kind", "diet"],
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a duplicate key without writing", async () => {
    const db = setup();
    const result = await saveCategory(
      null,
      form([
        ["label", "vegetarian"],
        ["kind", "diet"],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.label).toBe(
      "A category with that name already exists.",
    );
    expect(db.tables.dietary_categories).toHaveLength(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
