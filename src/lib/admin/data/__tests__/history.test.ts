/** @jest-environment node */
import { createAdminFakeDb } from "../../__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import {
  HISTORY_PAGE_SIZE,
  loadChangeLog,
  loadMealHistory,
  loadStaffOptions,
  loadRsvpHistory,
} from "../history";

type Db = ReturnType<typeof createAdminFakeDb>;
const asClient = (db: Db) => db as never;

// The shared fake has no range filters, so this test adds gte/lt to it.
type Patchable = {
  filters: ((r: Record<string, unknown>) => boolean)[];
  gte?: unknown;
  lt?: unknown;
};
function withRangeFilters(db: Db): { bounds: unknown[][] } {
  const bounds: unknown[][] = [];
  const proto = Object.getPrototypeOf(db.from("audit_log")) as Patchable & {
    [k: string]: unknown;
  };
  proto.gte = function (this: Patchable, col: string, v: string) {
    bounds.push(["gte", col, v]);
    this.filters.push((r) => (r[col] as string) >= v);
    return this;
  };
  proto.lt = function (this: Patchable, col: string, v: string) {
    bounds.push(["lt", col, v]);
    this.filters.push((r) => (r[col] as string) < v);
    return this;
  };
  return { bounds };
}

const none = { from: "", to: "", by: "anyone", page: 1 };

const staff = [
  { user_id: "u-hannah", display_name: "Hannah", role: "couple" },
  { user_id: "u-chris", display_name: "Chris", role: "couple" },
];

function log(over: Record<string, unknown>) {
  return {
    id: 1,
    at: "2026-10-25T17:41:00Z",
    actor_user_id: "u-hannah",
    actor_kind: "couple",
    entity: "households",
    entity_id: "h-1",
    action: "update",
    changed_fields: ["notes", "plus_one_allowance"],
    ...over,
  };
}

describe("loadChangeLog", () => {
  it("returns newest first with names, labels, action and field names only", async () => {
    const db = createAdminFakeDb({
      staff,
      audit_log: [
        log({ id: 1, at: "2026-10-24T16:55:00Z" }),
        log({
          id: 2,
          at: "2026-10-25T17:41:00Z",
          changed_fields: ["staff_notes", "plus_one_allowance"],
        }),
        log({
          id: 3,
          at: "2026-10-25T17:12:00Z",
          actor_user_id: "u-gone",
          entity: "campaigns",
          changed_fields: ["audience"],
        }),
        log({
          id: 4,
          at: "2026-10-24T09:00:00Z",
          actor_user_id: null,
          actor_kind: "guest",
          entity: "invitations",
          changed_fields: ["status", "responded_at"],
        }),
        log({
          id: 5,
          at: "2026-10-23T09:00:00Z",
          actor_user_id: null,
          actor_kind: "system",
          action: "insert",
          changed_fields: null,
        }),
      ],
    });
    const { rows } = await loadChangeLog(asClient(db), none);
    expect(rows.map((r) => r.id)).toEqual([2, 3, 1, 4, 5]);
    expect(rows[0]).toMatchObject({
      who: "Hannah (couple)",
      entity: "Household",
      action: "Update",
      fieldsChanged: "staff notes, plus-one allowance",
    });
    expect(rows[1]).toMatchObject({
      who: "Couple (former member)",
      entity: "Campaign",
      fieldsChanged: "audience",
    });
    expect(rows[3]).toMatchObject({ who: "Guest", entity: "Invitation" });
    expect(rows[3].fieldsChanged).toBe("status, responded at");
    expect(rows[4]).toMatchObject({
      who: "System",
      action: "Add",
      fieldsChanged: "",
    });
  });

  it("never exposes any values", async () => {
    const db = createAdminFakeDb({
      staff,
      audit_log: [
        log({ old_row: { notes: "SECRET" }, entity_id: "h-secret-id" }),
      ],
    });
    const { rows } = await loadChangeLog(asClient(db), none);
    expect(JSON.stringify(rows)).not.toMatch(/SECRET|h-secret-id/);
  });

  it("pages 50 at a time and says whether there is another page", async () => {
    const many = Array.from({ length: HISTORY_PAGE_SIZE + 5 }, (_, i) =>
      log({
        id: i + 1,
        at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
      }),
    );
    const db = createAdminFakeDb({ staff, audit_log: many });
    const first = await loadChangeLog(asClient(db), none);
    expect(HISTORY_PAGE_SIZE).toBe(50);
    expect(first.rows).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    const second = await loadChangeLog(asClient(db), { ...none, page: 2 });
    expect(second.rows).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(second.page).toBe(2);
  });

  it("turns Pacific days into the start and end of that day in UTC", async () => {
    const db = createAdminFakeDb({ staff, audit_log: [] });
    const { bounds } = withRangeFilters(db);
    await loadChangeLog(asClient(db), {
      ...none,
      from: "2026-10-25",
      to: "2026-10-25",
    });
    expect(bounds).toEqual([
      ["gte", "at", "2026-10-25T07:00:00.000Z"],
      ["lt", "at", "2026-10-26T07:00:00.000Z"],
    ]);
  });

  it("uses the winter offset after the clocks change", async () => {
    const db = createAdminFakeDb({ staff, audit_log: [] });
    const { bounds } = withRangeFilters(db);
    await loadChangeLog(asClient(db), {
      ...none,
      from: "2026-11-01",
      to: "2026-11-01",
    });
    expect(bounds).toEqual([
      ["gte", "at", "2026-11-01T07:00:00.000Z"],
      ["lt", "at", "2026-11-02T08:00:00.000Z"],
    ]);
  });

  it("filters by anyone, a staff member, guest or system", async () => {
    const rowsIn = [
      log({ id: 1 }),
      log({ id: 2, actor_user_id: "u-chris" }),
      log({ id: 3, actor_user_id: null, actor_kind: "guest" }),
      log({ id: 4, actor_user_id: null, actor_kind: "system" }),
    ];
    const ids = async (by: string) => {
      const db = createAdminFakeDb({ staff, audit_log: rowsIn });
      const { rows } = await loadChangeLog(asClient(db), { ...none, by });
      return rows.map((r) => r.id).sort();
    };
    expect(await ids("anyone")).toEqual([1, 2, 3, 4]);
    expect(await ids("u-chris")).toEqual([2]);
    expect(await ids("guest")).toEqual([3]);
    expect(await ids("system")).toEqual([4]);
  });

  it("throws when the read fails", async () => {
    const db = createAdminFakeDb({});
    db.failNext("audit_log", { message: "boom" });
    await expect(loadChangeLog(asClient(db), none)).rejects.toThrow();
  });
});

describe("loadRsvpHistory", () => {
  it("shows guest, event, the change in words and who made it", async () => {
    const db = createAdminFakeDb({
      staff,
      guests: [
        {
          id: "g-1",
          first_name: "Sam",
          last_name: "Example",
          household_id: "h",
        },
      ],
      events: [{ id: "e-1", name: "Ceremony and reception" }],
      rsvp_history: [
        {
          id: 1,
          guest_id: "g-1",
          event_id: "e-1",
          old_status: null,
          new_status: "attending",
          actor_kind: "couple",
          changed_by: "u-hannah",
          changed_at: "2026-10-03T21:14:00Z",
        },
        {
          id: 2,
          guest_id: null,
          event_id: "e-1",
          old_status: "attending",
          new_status: "declined",
          actor_kind: "guest",
          changed_by: "u-x",
          changed_at: "2026-09-20T01:30:00Z",
        },
      ],
    });
    const { rows } = await loadRsvpHistory(asClient(db), none);
    expect(rows[0]).toMatchObject({
      guestName: "Sam Example",
      eventName: "Ceremony and reception",
      change: "Pending to Attending",
      answeredBy: { kind: "staff", name: "Hannah" },
    });
    expect(rows[1]).toMatchObject({
      guestName: "Removed guest",
      change: "Attending to Declined",
      answeredBy: { kind: "guest" },
    });
  });

  it("filters by who made the change", async () => {
    const base = {
      guest_id: null,
      event_id: null,
      old_status: "pending",
      new_status: "declined",
      changed_at: "2026-10-03T21:14:00Z",
    };
    const db = createAdminFakeDb({
      staff,
      rsvp_history: [
        { ...base, id: 1, actor_kind: "guest", changed_by: "u-x" },
        { ...base, id: 2, actor_kind: "couple", changed_by: "u-chris" },
      ],
    });
    const { rows } = await loadRsvpHistory(asClient(db), {
      ...none,
      by: "u-chris",
    });
    expect(rows.map((r) => r.id)).toEqual([2]);
  });
});

describe("loadMealHistory", () => {
  const base = {
    guest_id: "g-1",
    course_id: "c-main",
    old_dish_id: null,
    new_dish_id: null,
    changed_by: "u-x",
    actor_kind: "guest",
    changed_at: "2026-10-01T15:00:00Z",
  };
  const tables = {
    staff,
    guests: [
      {
        id: "g-1",
        first_name: "Alex",
        last_name: "Example",
        household_id: "h-1",
      },
    ],
    households: [{ id: "h-1", auth_user_id: "u-household" }],
    courses: [{ id: "c-main", name: "Main" }],
    dishes: [
      { id: "d-salmon", name: "Grilled salmon" },
      { id: "d-tart", name: "Lemon tart" },
    ],
  };

  it("shows from and to dish names, None, the reason in words and attribution", async () => {
    const db = createAdminFakeDb({
      ...tables,
      meal_selection_history: [
        {
          ...base,
          id: 1,
          old_dish_id: "d-salmon",
          new_dish_id: null,
          reason: "declined",
        },
        {
          ...base,
          id: 2,
          old_dish_id: null,
          new_dish_id: "d-tart",
          reason: "changed",
          actor_kind: "couple",
          changed_by: "u-hannah",
          changed_at: "2026-10-03T22:15:00Z",
        },
        {
          ...base,
          id: 3,
          old_dish_id: "d-salmon",
          new_dish_id: null,
          reason: "dish_archived",
          guest_id: null,
          actor_kind: "system",
          changed_by: null,
          changed_at: "2026-09-01T00:00:00Z",
        },
      ],
    });
    const { rows } = await loadMealHistory(asClient(db), none);
    expect(rows.map((r) => r.id)).toEqual([2, 1, 3]);
    expect(rows[0]).toMatchObject({
      guestName: "Alex Example",
      courseName: "Main",
      from: "None",
      to: "Lemon tart",
      reason: "Changed",
      answeredBy: { kind: "staff", name: "Hannah" },
    });
    expect(rows[1]).toMatchObject({
      from: "Grilled salmon",
      to: "None",
      reason: "Declined",
      answeredBy: { kind: "guest" },
    });
    expect(rows[2]).toMatchObject({
      guestName: "Removed guest",
      reason: "Dish archived",
      answeredBy: { kind: "system" },
    });
  });

  it("uses the account comparison for rows with an empty actor_kind", async () => {
    const db = createAdminFakeDb({
      ...tables,
      meal_selection_history: [
        {
          ...base,
          id: 1,
          new_dish_id: "d-tart",
          reason: "changed",
          actor_kind: null,
          changed_by: "u-household",
        },
        {
          ...base,
          id: 2,
          new_dish_id: "d-tart",
          reason: "changed",
          actor_kind: null,
          changed_by: "u-nobody",
          changed_at: "2026-10-02T15:00:00Z",
        },
      ],
    });
    const { rows } = await loadMealHistory(asClient(db), none);
    expect(rows.find((r) => r.id === 1)?.answeredBy.kind).toBe("guest");
    expect(rows.find((r) => r.id === 2)?.answeredBy.kind).toBe("unknown");
  });
});

describe("loadStaffOptions", () => {
  it("lists staff by name for the Changed by filter", async () => {
    const db = createAdminFakeDb({ staff });
    expect(await loadStaffOptions(asClient(db))).toEqual([
      { id: "u-chris", label: "Chris" },
      { id: "u-hannah", label: "Hannah" },
    ]);
  });
});
