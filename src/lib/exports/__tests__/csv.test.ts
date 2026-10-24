import {
  buildCatererCsv,
  buildGuestsCsv,
  buildResponsesCsv,
  escapeCell,
  type CatererData,
  type GuestEventRow,
  type ResponseRow,
} from "../csv";

describe("escapeCell", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])(
    "prefixes %j to block formula injection",
    (value) => {
      expect(escapeCell(value).replace(/^"|"$/g, "")).toMatch(/^'/);
    },
  );

  it("leaves ordinary text alone and handles null", () => {
    expect(escapeCell("plain")).toBe("plain");
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
    expect(escapeCell(42)).toBe("42");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("a\nb")).toBe('"a\nb"');
  });
});

const guestRow = (over: Partial<GuestEventRow> = {}): GuestEventRow => ({
  household: "Test Household",
  guest: "Test Guest",
  event: "ceremony",
  status: "attending",
  dietary_categories: ["vegetarian", "nuts"],
  dietary_notes: "placeholder note",
  ...over,
});

const respRow = (over: Partial<ResponseRow> = {}): ResponseRow => ({
  household: "Test Household",
  guest: "Test Guest",
  event: "ceremony",
  status: "attending",
  responded_at: "2026-01-02T03:04:05Z",
  dishes: ["Course A: Dish A"],
  ...over,
});

const lines = (csv: string) => csv.trimEnd().split("\r\n");

describe("buildGuestsCsv", () => {
  it("has a header and one row per guest per event", () => {
    const csv = buildGuestsCsv([
      guestRow(),
      guestRow({ event: "rehearsal", status: "pending" }),
    ]);
    const l = lines(csv);
    expect(l[0]).toBe(
      "household,guest,event,status,dietary_categories,dietary_notes",
    );
    expect(l).toHaveLength(3);
    expect(l[1]).toContain("vegetarian; nuts");
  });

  it("prefixes formula-like cells", () => {
    const csv = buildGuestsCsv([guestRow({ guest: "=HYPERLINK(x)" })]);
    expect(lines(csv)[1]).toContain("'=HYPERLINK(x)");
  });
});

describe("buildResponsesCsv", () => {
  it("has a header and one row per guest per event", () => {
    const l = lines(
      buildResponsesCsv([respRow(), respRow({ event: "rehearsal" })]),
    );
    expect(l[0]).toBe("household,guest,event,status,responded_at,dishes");
    expect(l).toHaveLength(3);
    expect(l[1]).toContain("2026-01-02T03:04:05Z");
  });
});

describe("buildCatererCsv", () => {
  const data: CatererData = {
    dishTotals: [
      { event: "dinner", course: "Course A", dish: "Dish A", count: 12 },
      { event: "dinner", course: "Course A", dish: "Dish B", count: 7 },
    ],
    notYetChosen: [{ event: "dinner", course: "Course A", count: 3 }],
    restrictions: [
      {
        event: "dinner",
        household: "Test Household",
        guest: "Test Guest",
        severity: "allergy",
        category: "nuts",
        notes: "placeholder",
      },
    ],
    conflicts: [
      {
        event: "dinner",
        course: "Course A",
        dish: "Dish B",
        household: "Test Household",
        guest: "Test Guest",
        category: "nuts",
      },
    ],
  };

  it("includes per-dish totals, restrictions and conflicts", () => {
    const l = lines(buildCatererCsv(data));
    expect(l[0]).toBe(
      "section,event,course,dish,count,household,guest,severity,category,notes",
    );
    expect(l.filter((x) => x.startsWith("dish_total,"))).toHaveLength(2);
    expect(
      l.some((x) => x.startsWith("dish_total,dinner,Course A,Dish A,12")),
    ).toBe(true);
    expect(l.filter((x) => x.startsWith("not_yet_chosen,"))).toHaveLength(1);
    expect(l.filter((x) => x.startsWith("restriction,"))).toHaveLength(1);
    expect(l.filter((x) => x.startsWith("meal_conflict,"))).toHaveLength(1);
  });

  it("still has a header when empty", () => {
    expect(
      lines(
        buildCatererCsv({
          dishTotals: [],
          notYetChosen: [],
          restrictions: [],
          conflicts: [],
        }),
      ),
    ).toHaveLength(1);
  });
});

describe("scale (150 guests)", () => {
  const events = ["welcome-party", "rehearsal", "ceremony", "reception"];
  const guests = Array.from({ length: 150 }, (_, i) => `Guest ${i}`);

  it("builds guests, responses and caterer exports in under 60 seconds each", () => {
    const g: GuestEventRow[] = guests.flatMap((guest, i) =>
      events.map((event) =>
        guestRow({ guest, event, household: `Household ${i % 50}` }),
      ),
    );
    const r: ResponseRow[] = guests.flatMap((guest) =>
      events.map((event) => respRow({ guest, event })),
    );
    const c: CatererData = {
      dishTotals: events.flatMap((event) =>
        ["A", "B", "C"].map((d) => ({
          event,
          course: "Course",
          dish: `Dish ${d}`,
          count: 50,
        })),
      ),
      notYetChosen: [],
      restrictions: guests.map((guest) => ({
        event: "reception",
        household: "H",
        guest,
        severity: "preference",
        category: "vegetarian",
        notes: null,
      })),
      conflicts: [],
    };
    for (const build of [
      () => buildGuestsCsv(g),
      () => buildResponsesCsv(r),
      () => buildCatererCsv(c),
    ]) {
      const start = Date.now();
      const csv = build();
      expect(Date.now() - start).toBeLessThan(60_000);
      expect(csv.length).toBeGreaterThan(0);
    }
  });
});
