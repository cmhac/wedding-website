/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import {
  loadDuplicates,
  loadHouseholdDetail,
  loadEventOptions,
  loadHouseholdList,
  normalizeForSearch,
  parseHouseholdQuery,
} from "../households";

type Row = Record<string, unknown>;

const household = (id: string, name: string, extra: Row = {}): Row => ({
  id,
  display_name: name,
  contact_email: `${id}@example.test`,
  plus_one_allowance: 0,
  delivery_problem: false,
  notes: null,
  address: null,
  rsvp_deadline_override: null,
  reminders_opt_out: false,
  message_to_couple: null,
  auth_user_id: null,
  created_at: "2027-01-01T00:00:00Z",
  updated_at: "2027-01-01T00:00:00Z",
  ...extra,
});

const guest = (
  id: string,
  householdId: string,
  first: string | null,
  last: string | null,
  extra: Row = {},
): Row => ({
  id,
  household_id: householdId,
  first_name: first,
  last_name: last,
  email: null,
  is_placeholder: false,
  is_plus_one: false,
  dietary_notes: null,
  notes: null,
  ...extra,
});

function seed() {
  return {
    households: [
      household("h-b", "The Examples", { plus_one_allowance: 1 }),
      household("h-a", "Accent family"),
      household("h-c", "Example, Jordan", { delivery_problem: true }),
      household("h-d", "Exampleton family", {
        contact_email: "",
        plus_one_allowance: 1,
      }),
      household("h-e", "Sample Family", {
        contact_email: null,
        notes: "Friends of the couple",
        address: { street: "1 Sample Street", city: "Exampleville" },
        rsvp_deadline_override: "2027-09-01T18:59:00Z",
        reminders_opt_out: true,
        message_to_couple: "See you there",
      }),
    ],
    guests: [
      guest("g1", "h-b", "Sam", "Example"),
      guest("g2", "h-b", "Alex", "Example", {
        is_plus_one: true,
        email: "alex@example.test",
      }),
      guest("g3", "h-a", "José", "Accent"),
      guest("g4", "h-c", "Jordan", "Example"),
      guest("g5", "h-d", "Casey", "Exampleton"),
      guest("g6", "h-d", null, null, {
        is_placeholder: true,
        is_plus_one: true,
      }),
      guest("g7", "h-e", "Pat", "Sample"),
    ],
    events: [
      { id: "e-party", slug: "welcome-party", name: "Welcome party" },
      { id: "e-wedding", slug: "wedding", name: "Wedding" },
    ],
    invitations: [
      { event_id: "e-party", guest_id: "g1", status: "pending" },
      { event_id: "e-wedding", guest_id: "g1", status: "pending" },
      { event_id: "e-wedding", guest_id: "g3", status: "attending" },
      { event_id: "e-wedding", guest_id: "g7", status: "pending" },
    ],
    household_rsvp_progress: [
      progress("h-a", 0, 0, 0),
      progress("h-b", 2, 1, 0),
      progress("h-c", 0, 0, 0),
      progress("h-d", 0, 1, 3),
      progress("h-e", 1, 0, 0),
    ],
    dietary_categories: [
      { key: "vegetarian", label: "Vegetarian" },
      { key: "tree-nuts", label: "Tree nuts" },
    ],
    guest_dietary: [
      {
        guest_id: "g1",
        category_key: "vegetarian",
        severity: "preference",
        details: null,
      },
      {
        guest_id: "g2",
        category_key: "tree-nuts",
        severity: "allergy",
        details: "Carries an EpiPen",
      },
    ],
    settings: [{ id: true, default_rsvp_deadline: "2027-09-02T06:59:00Z" }],
  };
}

function progress(id: string, req: number, opt: number, meals: number): Row {
  return {
    household_id: id,
    pending_required: req,
    pending_optional: opt,
    pending_meals: meals,
  };
}

/** A fake database whose staff functions read from its own tables. */
function build(duplicates: Row[] = []) {
  const db = createAdminFakeDb(seed(), {
    rpcs: {
      staff_households: () => db.tables.households,
      staff_guests: () => db.tables.guests,
      staff_invitations: () => db.tables.invitations,
      find_duplicate_households: () => duplicates,
    },
  });
  const selects: { table: string; columns: unknown }[] = [];
  const realFrom = db.from.bind(db);
  const spied = {
    ...db,
    from: (table: string) => {
      const query = realFrom(table);
      const realSelect = query.select.bind(query);
      query.select = ((columns?: unknown) => {
        selects.push({ table, columns });
        return realSelect();
      }) as typeof query.select;
      return query;
    },
  };
  return {
    db,
    selects,
    client: spied as unknown as SupabaseClient,
  };
}

const query = (
  over: Partial<Parameters<typeof loadHouseholdList>[0]> = {},
) => ({
  q: "",
  invited: "",
  show: "everyone" as const,
  page: 1,
  ...over,
});

const names = (rows: { displayName: string }[]) =>
  rows.map((r) => r.displayName);

describe("normalizeForSearch", () => {
  it("lowercases, drops accents and trims", () => {
    expect(normalizeForSearch("  José ")).toBe("jose");
    expect(normalizeForSearch("ÉCOLE")).toBe("ecole");
  });
});

describe("loadHouseholdList", () => {
  it("sorts by display name and reports the total", async () => {
    const { client } = build();
    const list = await loadHouseholdList(query(), client);
    expect(names(list.rows)).toEqual([
      "Accent family",
      "Example, Jordan",
      "Exampleton family",
      "Sample Family",
      "The Examples",
    ]);
    expect(list.total).toBe(5);
    expect(list.totalAll).toBe(5);
    expect(list.page).toBe(1);
    expect(list.pageCount).toBe(1);
  });

  it("matches a household name ignoring capitals", async () => {
    const { client } = build();
    const list = await loadHouseholdList(query({ q: "SAMPLE FAM" }), client);
    expect(names(list.rows)).toEqual(["Sample Family"]);
    expect(list.total).toBe(1);
    expect(list.totalAll).toBe(5);
  });

  it("matches any guest name ignoring capitals and accents", async () => {
    const { client } = build();
    const list = await loadHouseholdList(query({ q: "jose" }), client);
    expect(names(list.rows)).toEqual(["Accent family"]);
    const reverse = await loadHouseholdList(query({ q: "JOSÉ" }), client);
    expect(names(reverse.rows)).toEqual(["Accent family"]);
    const guestHit = await loadHouseholdList(query({ q: "alex" }), client);
    expect(names(guestHit.rows)).toEqual(["The Examples"]);
  });

  it("keeps households with a guest invited to the event slug", async () => {
    const { client } = build();
    const party = await loadHouseholdList(
      query({ invited: "welcome-party" }),
      client,
    );
    expect(names(party.rows)).toEqual(["The Examples"]);
    const wedding = await loadHouseholdList(
      query({ invited: "wedding" }),
      client,
    );
    expect(names(wedding.rows)).toEqual([
      "Accent family",
      "Sample Family",
      "The Examples",
    ]);
  });

  it("shows nobody for an event slug that does not exist", async () => {
    const { client } = build();
    const list = await loadHouseholdList(query({ invited: "nope" }), client);
    expect(list.rows).toEqual([]);
    expect(list.total).toBe(0);
  });

  it.each([
    ["required", ["Sample Family", "The Examples"]],
    ["optional", ["Exampleton family", "The Examples"]],
    ["meals", ["Exampleton family"]],
    ["delivery_problem", ["Example, Jordan"]],
    ["paper_only", ["Exampleton family", "Sample Family"]],
  ] as const)("show=%s", async (show, expected) => {
    const { client } = build();
    const list = await loadHouseholdList(query({ show }), client);
    expect(names(list.rows)).toEqual(expected);
  });

  it("treats an unknown show value as everyone", async () => {
    const { client } = build();
    const list = await loadHouseholdList(
      query({ show: "bogus" as never }),
      client,
    );
    expect(list.total).toBe(5);
  });

  it("combines search, invited and show", async () => {
    const { client } = build();
    const list = await loadHouseholdList(
      query({ q: "example", invited: "wedding", show: "required" }),
      client,
    );
    expect(names(list.rows)).toEqual(["The Examples"]);
  });

  it("pages 25 per page with a total count", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      household(`m${i}`, `Family ${String(i).padStart(2, "0")}`),
    );
    const db = createAdminFakeDb(
      { ...seed(), households: many, guests: [], invitations: [] },
      {
        rpcs: {
          staff_households: () => many,
          staff_guests: () => [],
          staff_invitations: () => [],
          find_duplicate_households: () => [],
        },
      },
    );
    const client = db as unknown as SupabaseClient;
    const first = await loadHouseholdList(query(), client);
    expect(first.rows).toHaveLength(25);
    expect(first.total).toBe(30);
    expect(first.pageCount).toBe(2);
    const second = await loadHouseholdList(query({ page: 2 }), client);
    expect(second.rows).toHaveLength(5);
    expect(second.rows[0].displayName).toBe("Family 25");
    const beyond = await loadHouseholdList(query({ page: 9 }), client);
    expect(beyond.page).toBe(2);
  });

  it("builds plus-one counts, unnamed seats and outstanding counts", async () => {
    const { client } = build();
    const list = await loadHouseholdList(query(), client);
    const examples = list.rows.find((r) => r.id === "h-b");
    expect(examples).toMatchObject({
      plusOnesAllowed: 1,
      plusOnesNamed: 1,
      unnamedSeats: 0,
      guestNames: ["Sam Example", "Alex Example"],
      contactEmail: "h-b@example.test",
      outstanding: { required: 2, optional: 1, meals: 0 },
    });
    const exampleton = list.rows.find((r) => r.id === "h-d");
    expect(exampleton).toMatchObject({
      plusOnesAllowed: 1,
      plusOnesNamed: 0,
      unnamedSeats: 1,
      guestNames: ["Casey Exampleton"],
    });
  });

  it("flags delivery problem, paper only and possible duplicate", async () => {
    const { client } = build([
      {
        household_a: "h-d",
        household_b: "h-e",
        reasons: ["display_name"],
      },
    ]);
    const list = await loadHouseholdList(query(), client);
    const flags = (id: string) => {
      const row = list.rows.find((r) => r.id === id)!;
      return [row.deliveryProblem, row.paperOnly, row.possibleDuplicate];
    };
    expect(flags("h-c")).toEqual([true, false, false]);
    expect(flags("h-d")).toEqual([false, true, true]);
    expect(flags("h-e")).toEqual([false, true, true]);
    expect(flags("h-b")).toEqual([false, false, false]);
    expect(list.rows.find((r) => r.id === "h-d")?.contactEmail).toBeNull();
  });

  it("names its columns and never selects * on households, guests or invitations", async () => {
    const { client, selects, db } = build();
    await loadHouseholdList(query({ invited: "wedding" }), client);
    await loadDuplicates(client);
    await loadHouseholdDetail("h-b", client);
    for (const { table, columns } of selects) {
      if (["households", "guests", "invitations"].includes(table)) {
        expect(columns).toBeTruthy();
        expect(columns).not.toBe("*");
      }
    }
    const fns = db.rpcCalls.map((c) => c.fn);
    expect(fns).toEqual(
      expect.arrayContaining(["staff_households", "staff_guests"]),
    );
  });
});

describe("loadDuplicates", () => {
  it("returns pairs with plain-English reasons", async () => {
    const { client } = build([
      { household_a: "h-d", household_b: "h-b", reasons: ["display_name"] },
      { household_a: "h-a", household_b: "h-e", reasons: ["address"] },
      {
        household_a: "h-c",
        household_b: "h-b",
        reasons: ["display_name", "address"],
      },
    ]);
    const pairs = await loadDuplicates(client);
    expect(pairs).toEqual([
      {
        a: { id: "h-d", displayName: "Exampleton family" },
        b: { id: "h-b", displayName: "The Examples" },
        reason: "Same name once spacing and capitals are ignored",
      },
      {
        a: { id: "h-a", displayName: "Accent family" },
        b: { id: "h-e", displayName: "Sample Family" },
        reason: "Same address",
      },
      {
        a: { id: "h-c", displayName: "Example, Jordan" },
        b: { id: "h-b", displayName: "The Examples" },
        reason: "Same name once spacing and capitals are ignored; Same address",
      },
    ]);
  });

  it("returns an empty list when there are none", async () => {
    const { client } = build([]);
    expect(await loadDuplicates(client)).toEqual([]);
  });
});

describe("loadHouseholdDetail", () => {
  it("returns every household field and the guests with dietary entries", async () => {
    const { client } = build();
    const detail = await loadHouseholdDetail("h-e", client);
    expect(detail).toMatchObject({
      id: "h-e",
      displayName: "Sample Family",
      contactEmail: null,
      plusOneAllowance: 0,
      address: { street: "1 Sample Street", city: "Exampleville" },
      notes: "Friends of the couple",
      rsvpDeadlineOverride: "2027-09-01T18:59:00Z",
      remindersOptOut: true,
      deliveryProblem: false,
      messageToCouple: "See you there",
      defaultDeadline: "2027-09-02T06:59:00Z",
    });
    expect(detail?.guests).toHaveLength(1);
  });

  it("attaches dietary entries with labels, severity and details", async () => {
    const { client } = build();
    const detail = await loadHouseholdDetail("h-b", client);
    expect(detail?.guests.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(detail?.guests[0].dietary).toEqual([
      {
        categoryKey: "vegetarian",
        label: "Vegetarian",
        severity: "preference",
        details: null,
      },
    ]);
    expect(detail?.guests[1]).toMatchObject({
      firstName: "Alex",
      lastName: "Example",
      email: "alex@example.test",
      isPlusOne: true,
      isPlaceholder: false,
      dietary: [
        {
          categoryKey: "tree-nuts",
          label: "Tree nuts",
          severity: "allergy",
          details: "Carries an EpiPen",
        },
      ],
    });
    expect(detail?.dietaryCategories).toEqual([
      { key: "vegetarian", label: "Vegetarian" },
      { key: "tree-nuts", label: "Tree nuts" },
    ]);
  });

  it("includes unnamed plus-one seats", async () => {
    const { client } = build();
    const detail = await loadHouseholdDetail("h-d", client);
    expect(detail?.guests.find((g) => g.isPlaceholder)).toMatchObject({
      firstName: null,
      lastName: null,
      isPlusOne: true,
    });
  });

  it("returns null for an unknown id", async () => {
    const { client } = build();
    expect(await loadHouseholdDetail("nope", client)).toBeNull();
  });
});

describe("parseHouseholdQuery", () => {
  it("reads the search, event, filter and page", () => {
    expect(
      parseHouseholdQuery({
        q: " jose ",
        invited: "wedding",
        show: "meals",
        page: "3",
      }),
    ).toEqual({
      query: { q: "jose", invited: "wedding", show: "meals", page: 3 },
      duplicates: false,
    });
  });

  it("falls back to safe defaults for missing or bad values", () => {
    expect(
      parseHouseholdQuery({ show: "bogus", page: "-4", q: ["a", "b"] }),
    ).toEqual({
      query: { q: "a", invited: "", show: "everyone", page: 1 },
      duplicates: false,
    });
    expect(parseHouseholdQuery({ page: "abc" }).query.page).toBe(1);
    expect(parseHouseholdQuery({}).query).toEqual({
      q: "",
      invited: "",
      show: "everyone",
      page: 1,
    });
  });

  it("selects the duplicates view", () => {
    expect(parseHouseholdQuery({ view: "duplicates" }).duplicates).toBe(true);
    expect(parseHouseholdQuery({ view: "all" }).duplicates).toBe(false);
  });
});

describe("loadEventOptions", () => {
  it("returns each event's id, slug and name", async () => {
    const { client } = build();
    expect(await loadEventOptions(client)).toEqual([
      { id: "e-party", slug: "welcome-party", name: "Welcome party" },
      { id: "e-wedding", slug: "wedding", name: "Wedding" },
    ]);
  });
});
