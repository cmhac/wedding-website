/** @jest-environment node */
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";
import { messageFor } from "@/lib/admin/messages";

jest.mock("server-only", () => ({}), { virtual: true });
const revalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
jest.mock("@/lib/log", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { updateHouseholdFields } from "../households";

function setup(options: { user?: { id: string } | null } = {}) {
  const auth = fakeSupabase({
    user: options.user === undefined ? { id: "user-1" } : options.user,
    staffRole: "couple",
  });
  const db = createAdminFakeDb({
    households: [
      {
        id: "h1",
        display_name: "The Examples",
        contact_email: "h1@example.test",
        auth_user_id: "auth-h1",
        plus_one_allowance: 1,
        notes: null,
        address: null,
        rsvp_deadline_override: null,
        reminders_opt_out: false,
      },
    ],
  });
  const selects: string[] = [];
  const client = {
    auth: auth.client.auth,
    from: (table: string) => {
      if (table === "staff") return auth.client.from(table);
      const query = db.from(table);
      const realSelect = query.select.bind(query);
      query.select = (() => {
        selects.push(table);
        return realSelect();
      }) as typeof query.select;
      return query;
    },
  };
  return { db, client, selects };
}

function form(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const valid = (): Array<[string, string]> => [
  ["id", "h1"],
  ["display_name", "  The Examples  "],
  ["plus_one_allowance", "2"],
  ["rsvp_deadline_override", ""],
  ["address_street", "  1 Sample Street "],
  ["address_city", "Exampleville"],
  ["address_region", ""],
  ["address_postal_code", "90000"],
  ["address_country", ""],
  ["notes", "  Friends of Hannah  "],
  ["reminders_opt_out", "on"],
];

const run = (client: unknown, entries: Array<[string, string]>) =>
  updateHouseholdFields(null, form(entries), { supabase: client as never });

const replace = (
  entries: Array<[string, string]>,
  key: string,
  value: string,
): Array<[string, string]> =>
  entries.map(([k, v]) => (k === key ? [k, value] : [k, v]));

beforeEach(() => revalidatePath.mockClear());

describe("updateHouseholdFields", () => {
  it("updates the household with trimmed values and no contact email or sign-in account", async () => {
    const { db, client } = setup();
    const result = await run(client, valid());
    expect(result).toEqual({ ok: true });
    const write = db.writes.find(
      (w) => w.table === "households" && w.op === "update",
    );
    expect(write?.value).toEqual({
      display_name: "The Examples",
      plus_one_allowance: 2,
      rsvp_deadline_override: null,
      address: {
        street: "1 Sample Street",
        city: "Exampleville",
        postal_code: "90000",
      },
      notes: "Friends of Hannah",
      reminders_opt_out: true,
    });
    expect(write?.value).not.toHaveProperty("contact_email");
    expect(write?.value).not.toHaveProperty("auth_user_id");
    expect(db.tables.households[0].contact_email).toBe("h1@example.test");
    expect(db.tables.households[0].auth_user_id).toBe("auth-h1");
  });

  it("does not read the household back", async () => {
    const { client, selects } = setup();
    await run(client, valid());
    expect(selects).not.toContain("households");
  });

  it("revalidates the household page and the list", async () => {
    const { client } = setup();
    await run(client, valid());
    expect(revalidatePath).toHaveBeenCalledWith("/admin/households/h1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/households");
  });

  it("clears the address, notes and opt-out when they are left empty", async () => {
    const { db, client } = setup();
    const entries = valid()
      .filter(([k]) => k !== "reminders_opt_out")
      .map(([k, v]): [string, string] =>
        k.startsWith("address_") || k === "notes" ? [k, ""] : [k, v],
      );
    await run(client, entries);
    const write = db.writes.find((w) => w.op === "update");
    expect(write?.value).toMatchObject({
      address: null,
      notes: null,
      reminders_opt_out: false,
    });
  });

  it("requires a display name", async () => {
    const { db, client } = setup();
    const result = await run(client, replace(valid(), "display_name", "   "));
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { display_name: "This is required." },
    });
    expect(db.writes).toEqual([]);
  });

  it.each(["-1", "1.5", "abc", ""])(
    "rejects a plus-one allowance of %p",
    async (value) => {
      const { db, client } = setup();
      const result = await run(
        client,
        replace(valid(), "plus_one_allowance", value),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.fieldErrors).toHaveProperty("plus_one_allowance");
      expect(db.writes).toEqual([]);
    },
  );

  it("converts a Pacific deadline override to an exact moment", async () => {
    const { db, client } = setup();
    await run(
      client,
      replace(valid(), "rsvp_deadline_override", "2027-09-01T23:59"),
    );
    const write = db.writes.find((w) => w.op === "update");
    expect(write?.value).toMatchObject({
      rsvp_deadline_override: "2027-09-02T06:59:00.000Z",
    });
  });

  it("explains a deadline that is not a real time", async () => {
    const { db, client } = setup();
    const result = await run(
      client,
      replace(valid(), "rsvp_deadline_override", "2027-03-14T02:30"),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        rsvp_deadline_override: expect.stringMatching(/clocks change/),
      },
    });
    expect(db.writes).toEqual([]);
  });

  it("shows the allowance refusal and keeps the typed values", async () => {
    const { db, client } = setup();
    db.failNext("households", {
      message:
        "cannot lower the plus-one allowance below the number of named plus-ones",
    });
    const result = await run(
      client,
      replace(valid(), "plus_one_allowance", "0"),
    );
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("allowance_below_named_plus_ones"),
      values: { display_name: "  The Examples  ", plus_one_allowance: "0" },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the session-ended message with no session", async () => {
    const { db, client } = setup({ user: null });
    const result = await run(client, valid());
    expect(result).toEqual({
      ok: false,
      message: messageFor("unauthenticated"),
    });
    expect(db.writes).toEqual([]);
  });
});
