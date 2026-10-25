import { answeredByForMeal, answeredByForRsvp } from "../attribution";

const STAFF_ID = "00000000-0000-0000-0000-0000000000a1";
const OTHER_STAFF_ID = "00000000-0000-0000-0000-0000000000a2";
const GONE_ID = "00000000-0000-0000-0000-0000000000ff";
const HOUSEHOLD_ACCOUNT = "00000000-0000-0000-0000-0000000000b1";
const STRANGER = "00000000-0000-0000-0000-0000000000c1";

const staff = new Map([
  [STAFF_ID, "Sam Planner"],
  [OTHER_STAFF_ID, "Casey Couple"],
]);

type RsvpRow = Parameters<typeof answeredByForRsvp>[0]["history"][number];
type MealRow = Parameters<typeof answeredByForMeal>[0]["history"][number];

function rsvpRow(overrides: Partial<RsvpRow> = {}): RsvpRow {
  return {
    id: 1,
    new_status: "attending",
    actor_kind: "guest",
    changed_by: HOUSEHOLD_ACCOUNT,
    changed_at: "2027-01-01T10:00:00.000Z",
    ...overrides,
  };
}

function mealRow(overrides: Partial<MealRow> = {}): MealRow {
  return {
    id: 1,
    new_dish_id: "dish-fish",
    actor_kind: "guest",
    changed_by: HOUSEHOLD_ACCOUNT,
    changed_at: "2027-01-01T10:00:00.000Z",
    ...overrides,
  };
}

function rsvp(history: RsvpRow[], currentStatus = "attending") {
  return answeredByForRsvp({ currentStatus, history, staff });
}

function meal(
  history: MealRow[],
  options: {
    currentDishId?: string | null;
    householdAuthUserId?: string | null;
  } = {},
) {
  return answeredByForMeal({
    currentDishId:
      options.currentDishId === undefined ? "dish-fish" : options.currentDishId,
    history,
    householdAuthUserId:
      options.householdAuthUserId === undefined
        ? HOUSEHOLD_ACCOUNT
        : options.householdAuthUserId,
    staff,
  });
}

describe("answeredByForRsvp", () => {
  it("says not answered when there is no history", () => {
    expect(rsvp([], "pending")).toEqual({ kind: "not_answered" });
  });

  it("says not answered when no row matches the current status", () => {
    expect(rsvp([rsvpRow({ new_status: "declined" })])).toEqual({
      kind: "not_answered",
    });
  });

  it("gives guest, with the time, for a guest row", () => {
    expect(rsvp([rsvpRow()])).toEqual({
      kind: "guest",
      at: "2027-01-01T10:00:00.000Z",
    });
  });

  it.each(["couple", "planner"])(
    "gives staff with the name for %s",
    (actorKind) => {
      expect(
        rsvp([rsvpRow({ actor_kind: actorKind, changed_by: STAFF_ID })]),
      ).toEqual({
        kind: "staff",
        name: "Sam Planner",
        at: "2027-01-01T10:00:00.000Z",
      });
    },
  );

  it("gives former_staff when the staff member has gone", () => {
    expect(
      rsvp([rsvpRow({ actor_kind: "couple", changed_by: GONE_ID })]),
    ).toEqual({ kind: "former_staff", at: "2027-01-01T10:00:00.000Z" });
  });

  it("gives former_staff when staff recorded it but changed_by is empty", () => {
    expect(
      rsvp([rsvpRow({ actor_kind: "planner", changed_by: null })]).kind,
    ).toBe("former_staff");
  });

  it("gives system for a system row", () => {
    expect(rsvp([rsvpRow({ actor_kind: "system", changed_by: null })])).toEqual(
      {
        kind: "system",
        at: "2027-01-01T10:00:00.000Z",
      },
    );
  });

  it("uses the newest matching row, ignoring newer rows for other statuses", () => {
    const history = [
      rsvpRow({
        id: 1,
        actor_kind: "planner",
        changed_by: STAFF_ID,
        changed_at: "2027-01-01T10:00:00.000Z",
      }),
      rsvpRow({
        id: 2,
        new_status: "declined",
        actor_kind: "guest",
        changed_at: "2027-01-02T10:00:00.000Z",
      }),
    ];
    expect(rsvp(history)).toEqual({
      kind: "staff",
      name: "Sam Planner",
      at: "2027-01-01T10:00:00.000Z",
    });
  });

  it("shows guest when the guest changed their answer after staff recorded it", () => {
    const history = [
      rsvpRow({
        id: 1,
        actor_kind: "couple",
        changed_by: OTHER_STAFF_ID,
        changed_at: "2027-01-01T10:00:00.000Z",
      }),
      rsvpRow({
        id: 2,
        new_status: "declined",
        actor_kind: "guest",
        changed_at: "2027-01-02T10:00:00.000Z",
      }),
      rsvpRow({
        id: 3,
        actor_kind: "guest",
        changed_at: "2027-01-03T10:00:00.000Z",
      }),
    ];
    expect(rsvp(history)).toEqual({
      kind: "guest",
      at: "2027-01-03T10:00:00.000Z",
    });
    // The earlier staff step is still in the rows the history page reads.
    expect(history[0].actor_kind).toBe("couple");
  });

  it("breaks a tie on time by the higher id", () => {
    const at = "2027-01-01T10:00:00.000Z";
    const history = [
      rsvpRow({ id: 5, actor_kind: "guest", changed_at: at }),
      rsvpRow({
        id: 4,
        actor_kind: "system",
        changed_by: null,
        changed_at: at,
      }),
    ];
    expect(rsvp(history).kind).toBe("guest");
  });
});

describe("answeredByForMeal", () => {
  it("says not answered when there is no current dish", () => {
    expect(meal([mealRow()], { currentDishId: null })).toEqual({
      kind: "not_answered",
    });
  });

  it("says not answered when there is no matching history row", () => {
    expect(meal([mealRow({ new_dish_id: "dish-beef" })])).toEqual({
      kind: "not_answered",
    });
    expect(meal([])).toEqual({ kind: "not_answered" });
  });

  it("gives guest for a guest row", () => {
    expect(meal([mealRow()])).toEqual({
      kind: "guest",
      at: "2027-01-01T10:00:00.000Z",
    });
  });

  it.each(["couple", "planner"])("gives staff with the name for %s", (kind) => {
    expect(
      meal([mealRow({ actor_kind: kind, changed_by: OTHER_STAFF_ID })]),
    ).toEqual({
      kind: "staff",
      name: "Casey Couple",
      at: "2027-01-01T10:00:00.000Z",
    });
  });

  it("gives former_staff when the staff member has gone", () => {
    expect(
      meal([mealRow({ actor_kind: "planner", changed_by: GONE_ID })]).kind,
    ).toBe("former_staff");
  });

  it("gives system for a system row", () => {
    expect(
      meal([mealRow({ actor_kind: "system", changed_by: null })]).kind,
    ).toBe("system");
  });

  it("uses the newest row for the current dish", () => {
    const history = [
      mealRow({ id: 1, actor_kind: "planner", changed_by: STAFF_ID }),
      mealRow({
        id: 2,
        new_dish_id: "dish-beef",
        changed_at: "2027-01-02T10:00:00.000Z",
      }),
      mealRow({
        id: 3,
        new_dish_id: "dish-fish",
        actor_kind: "guest",
        changed_at: "2027-01-03T10:00:00.000Z",
      }),
    ];
    expect(meal(history)).toEqual({
      kind: "guest",
      at: "2027-01-03T10:00:00.000Z",
    });
  });

  describe("rows written before the migration (empty actor_kind)", () => {
    const old = (changedBy: string | null) =>
      mealRow({ actor_kind: null, changed_by: changedBy });

    it("gives guest when only the household account matches", () => {
      expect(meal([old(HOUSEHOLD_ACCOUNT)])).toEqual({
        kind: "guest",
        at: "2027-01-01T10:00:00.000Z",
      });
    });

    it("gives staff with the name when only a staff member matches", () => {
      expect(meal([old(STAFF_ID)])).toEqual({
        kind: "staff",
        name: "Sam Planner",
        at: "2027-01-01T10:00:00.000Z",
      });
    });

    it("gives shared_account when the household account is also staff", () => {
      const result = answeredByForMeal({
        currentDishId: "dish-fish",
        history: [old(STAFF_ID)],
        householdAuthUserId: STAFF_ID,
        staff,
      });
      expect(result).toEqual({
        kind: "shared_account",
        at: "2027-01-01T10:00:00.000Z",
      });
    });

    it("gives unknown when neither matches", () => {
      expect(meal([old(STRANGER)])).toEqual({
        kind: "unknown",
        at: "2027-01-01T10:00:00.000Z",
      });
    });

    it("gives unknown when changed_by is empty", () => {
      expect(meal([old(null)]).kind).toBe("unknown");
    });

    it("gives unknown when the household has no sign-in account and nobody matches", () => {
      expect(meal([old(STRANGER)], { householdAuthUserId: null }).kind).toBe(
        "unknown",
      );
    });
  });
});
