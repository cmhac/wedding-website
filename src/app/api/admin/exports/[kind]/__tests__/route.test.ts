/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));

import { AuthError } from "@/lib/auth/guards";
import { GET } from "../route";

type Rows = Record<string, unknown[] | { error: unknown }>;

/** A fake staff-session client: each table or view resolves to fixed rows. */
function fakeSupabase(tables: Rows) {
  return {
    from: jest.fn((name: string) => {
      const result = tables[name] ?? [];
      const out =
        "error" in (result as object) && !Array.isArray(result)
          ? { data: null, error: (result as { error: unknown }).error }
          : { data: result, error: null };
      const chain: Record<string, unknown> = {
        select: jest.fn(() => chain),
        order: jest.fn(() => chain),
        then: (resolve: (v: unknown) => unknown) => resolve(out),
      };
      return chain;
    }),
  };
}

const TABLES: Rows = {
  guests: [
    {
      first_name: "Ada",
      last_name: "Fake",
      is_placeholder: false,
      dietary_notes: "=cmd|' /C calc'!A0",
      households: { display_name: "The Fakes" },
      guest_dietary: [{ category_key: "nuts" }, { category_key: "vegan" }],
      invitations: [
        {
          status: "attending",
          responded_at: "2027-01-02T00:00:00Z",
          events: { id: "e1", name: "Ceremony" },
        },
      ],
    },
  ],
  meal_selections: [
    {
      guest_id: "g1",
      dishes: { name: "Fake Pie" },
      courses: { menus: { event_id: "e1" } },
    },
  ],
  dish_totals: [
    {
      event_name: "Ceremony",
      course_name: "Main",
      dish_name: "Fake Pie",
      chosen_count: 3,
    },
  ],
  dietary_list: [
    {
      event_name: "Ceremony",
      household_name: "The Fakes",
      guest_name: "Ada Fake",
      severity: "allergy",
      category_key: "nuts",
      notes: null,
    },
  ],
  meal_conflicts: [
    {
      event_name: "Ceremony",
      course_name: "Main",
      dish_name: "Fake Pie",
      household_name: "The Fakes",
      guest_name: "Ada Fake",
      category_key: "nuts",
    },
  ],
};

const ctx = (kind: string) => ({ params: Promise.resolve({ kind }) });
const get = (kind: string) =>
  GET(
    new Request(`http://localhost:3000/api/admin/exports/${kind}`),
    ctx(kind),
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "planner",
    supabase: fakeSupabase(TABLES),
  });
});

describe("GET /api/admin/exports/[kind]", () => {
  it("answers 401 without a session and 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    expect((await get("guests")).status).toBe(401);
    mockRequireStaff.mockRejectedValueOnce(new AuthError(403, "forbidden"));
    expect((await get("guests")).status).toBe(403);
  });

  it("answers 403 for non-staff before checking the kind", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AuthError(403, "forbidden"));
    expect((await get("nonsense")).status).toBe(403);
  });

  it("answers 404 for an unknown kind", async () => {
    const res = await get("nonsense");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it.each(["guests", "responses", "caterer"])(
    "returns %s as a CSV download",
    async (kind) => {
      const res = await get(kind);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename="${kind}.csv"`,
      );
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect((await res.text()).split("\r\n").length).toBeGreaterThan(2);
    },
  );

  it("guests: one row per guest per event, quoted safely", async () => {
    const text = await (await get("guests")).text();
    const [header, row] = text.split("\r\n");
    expect(header).toBe(
      "household,guest,event,status,dietary_categories,dietary_notes",
    );
    expect(
      row.startsWith("The Fakes,Ada Fake,Ceremony,attending,nuts; vegan,"),
    ).toBe(true);
    expect(row).toContain("'=cmd");
  });

  it("responses: includes responded_at and chosen dishes", async () => {
    const tables: Rows = {
      ...TABLES,
      guests: [
        {
          ...(TABLES.guests as object[])[0],
          id: "g1",
        },
      ],
    };
    mockRequireStaff.mockResolvedValue({
      kind: "staff",
      role: "couple",
      supabase: fakeSupabase(tables),
    });
    const text = await (await get("responses")).text();
    expect(text.split("\r\n")[1]).toBe(
      "The Fakes,Ada Fake,Ceremony,attending,2027-01-02T00:00:00Z,Fake Pie",
    );
  });

  it("caterer: dish totals, restrictions, and conflicts", async () => {
    const text = await (await get("caterer")).text();
    expect(text).toContain("dish_total,Ceremony,Main,Fake Pie,3");
    expect(text).toContain("restriction,Ceremony");
    expect(text).toContain("meal_conflict,Ceremony,Main,Fake Pie");
  });

  it("answers 500 without database text when a read fails", async () => {
    mockRequireStaff.mockResolvedValue({
      kind: "staff",
      role: "couple",
      supabase: fakeSupabase({ guests: { error: { message: "secret" } } }),
    });
    const res = await get("guests");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
