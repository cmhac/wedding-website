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
const redirect = jest.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), {
    digest: `NEXT_REDIRECT;replace;${path};307;`,
  });
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

import {
  confirmRemoveGuest,
  removeGuest,
  saveGuest,
  setGuestDietary,
} from "../guests";

function setup() {
  const auth = fakeSupabase({ user: { id: "user-1" }, staffRole: "planner" });
  const db = createAdminFakeDb({
    guests: [
      {
        id: "g1",
        household_id: "h1",
        first_name: "Sam",
        last_name: "Example",
        is_placeholder: false,
        is_plus_one: false,
      },
      {
        id: "g2",
        household_id: "h1",
        first_name: null,
        last_name: null,
        is_placeholder: true,
        is_plus_one: true,
      },
    ],
    guest_dietary: [
      {
        guest_id: "g1",
        category_key: "vegetarian",
        severity: "preference",
        details: null,
      },
    ],
  });
  const client = {
    auth: auth.client.auth,
    from: (table: string) =>
      table === "staff" ? auth.client.from(table) : db.from(table),
  };
  return { db, client };
}

function form(entries: Array<[string, string]>) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const opts = (client: unknown) => ({ supabase: client as never });
const save = (client: unknown, entries: Array<[string, string]>) =>
  saveGuest(null, form(entries), opts(client));
const inserts = (db: ReturnType<typeof setup>["db"]) =>
  db.writes.filter((w) => w.table === "guests" && w.op === "insert");
const updates = (db: ReturnType<typeof setup>["db"]) =>
  db.writes.filter((w) => w.table === "guests" && w.op === "update");

beforeEach(() => {
  revalidatePath.mockClear();
  redirect.mockClear();
});

describe("saveGuest: adding", () => {
  it("adds a named guest with trimmed fields", async () => {
    const { db, client } = setup();
    const result = await save(client, [
      ["household_id", "h1"],
      ["first_name", " Alex "],
      ["last_name", "Example"],
      ["email", "alex@example.test"],
      ["dietary_notes", ""],
      ["notes", "Carries an EpiPen"],
    ]);
    expect(result).toEqual({ ok: true });
    expect(inserts(db)[0].value).toMatchObject({
      household_id: "h1",
      first_name: "Alex",
      last_name: "Example",
      email: "alex@example.test",
      dietary_notes: null,
      notes: "Carries an EpiPen",
      is_placeholder: false,
      is_plus_one: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/households/h1");
  });

  it("can add a named plus-one", async () => {
    const { db, client } = setup();
    await save(client, [
      ["household_id", "h1"],
      ["first_name", "Robin"],
      ["last_name", "Example"],
      ["is_plus_one", "on"],
    ]);
    expect(inserts(db)[0].value).toMatchObject({
      is_plus_one: true,
      is_placeholder: false,
    });
  });

  it("requires first and last name for a named guest", async () => {
    const { db, client } = setup();
    const result = await save(client, [
      ["household_id", "h1"],
      ["first_name", ""],
      ["last_name", "  "],
    ]);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        first_name: "This is required.",
        last_name: "This is required.",
      },
    });
    expect(inserts(db)).toEqual([]);
  });

  it("rejects an email that is not an email", async () => {
    const { client } = setup();
    const result = await save(client, [
      ["household_id", "h1"],
      ["first_name", "Alex"],
      ["last_name", "Example"],
      ["email", "not-an-email"],
    ]);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String) },
    });
  });

  it("adds an unnamed plus-one seat only as a placeholder plus-one", async () => {
    const { db, client } = setup();
    const result = await save(client, [
      ["household_id", "h1"],
      ["is_placeholder", "true"],
    ]);
    expect(result).toEqual({ ok: true });
    const value = inserts(db)[0].value as Record<string, unknown>;
    expect(value).toMatchObject({
      household_id: "h1",
      is_placeholder: true,
      is_plus_one: true,
    });
    expect(value.first_name ?? null).toBeNull();
    expect(value.last_name ?? null).toBeNull();
  });

  it("shows the duplicate-name message and keeps the typed values", async () => {
    const { db, client } = setup();
    db.failNext("guests", {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "guests_unique_name_per_household"',
    });
    const result = await save(client, [
      ["household_id", "h1"],
      ["first_name", "Sam"],
      ["last_name", "Example"],
    ]);
    expect(result).toMatchObject({
      ok: false,
      message: messageFor("duplicate_guest_name"),
      values: { first_name: "Sam", last_name: "Example" },
    });
  });

  it("shows a plain refusal when a plus-one goes beyond the allowance", async () => {
    const { db, client } = setup();
    db.failNext("guests", {
      code: "P0001",
      message: "plus-one allowance exceeded",
    });
    const result = await save(client, [
      ["household_id", "h1"],
      ["is_placeholder", "true"],
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/allowance/i);
    expect(result.message).toMatch(/plus-one/i);
    expect(result.message).not.toMatch(/exceeded|P0001/);
    expect(result.message).not.toBe(messageFor("server_error"));
  });
});

describe("saveGuest: editing", () => {
  it("updates a named guest without touching plus-one flags", async () => {
    const { db, client } = setup();
    const result = await save(client, [
      ["household_id", "h1"],
      ["guest_id", "g1"],
      ["first_name", "Samuel"],
      ["last_name", "Example"],
      ["email", ""],
      ["notes", "Gluten free"],
    ]);
    expect(result).toEqual({ ok: true });
    const value = updates(db)[0].value as Record<string, unknown>;
    expect(value).toMatchObject({
      first_name: "Samuel",
      last_name: "Example",
      email: null,
      notes: "Gluten free",
    });
    expect(value).not.toHaveProperty("is_plus_one");
    expect(value).not.toHaveProperty("is_placeholder");
    expect(value).not.toHaveProperty("household_id");
  });

  it("naming a placeholder sets both names and keeps it a plus-one", async () => {
    const { db, client } = setup();
    const result = await save(client, [
      ["household_id", "h1"],
      ["guest_id", "g2"],
      ["is_placeholder", "true"],
      ["first_name", "Robin"],
      ["last_name", "Example"],
    ]);
    expect(result).toEqual({ ok: true });
    expect(updates(db)[0].value).toMatchObject({
      first_name: "Robin",
      last_name: "Example",
      is_placeholder: false,
      is_plus_one: true,
    });
    expect(db.tables.guests.find((g) => g.id === "g2")).toMatchObject({
      is_placeholder: false,
      is_plus_one: true,
    });
  });

  it("will not name a placeholder without both names", async () => {
    const { db, client } = setup();
    const result = await save(client, [
      ["household_id", "h1"],
      ["guest_id", "g2"],
      ["is_placeholder", "true"],
      ["first_name", "Robin"],
      ["last_name", ""],
    ]);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { last_name: "This is required." },
    });
    expect(updates(db)).toEqual([]);
  });
});

describe("removeGuest", () => {
  const entries = (
    extra: Array<[string, string]> = [],
  ): Array<[string, string]> => [
    ["household_id", "h1"],
    ["guest_id", "g1"],
    ...extra,
  ];

  it("does not delete without the confirm step value", async () => {
    const { db, client } = setup();
    const result = await removeGuest(null, form(entries()), opts(client));
    expect(result.ok).toBe(false);
    expect(db.tables.guests).toHaveLength(2);
    expect(db.writes.filter((w) => w.op === "delete")).toEqual([]);
  });

  it("deletes the guest once the confirm value is present", async () => {
    const { db, client } = setup();
    const result = await removeGuest(
      null,
      form(entries([["confirm", "remove-guest"]])),
      opts(client),
    );
    expect(result).toEqual({ ok: true });
    expect(db.tables.guests.map((g) => g.id)).toEqual(["g2"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/households/h1");
  });

  it("confirmRemoveGuest returns to the guests tab after removing", async () => {
    const { db, client } = setup();
    await expect(
      confirmRemoveGuest(
        form(entries([["confirm", "remove-guest"]])),
        opts(client),
      ),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });
    expect(db.tables.guests.map((g) => g.id)).toEqual(["g2"]);
    expect(redirect).toHaveBeenCalledWith(
      "/admin/households/h1?tab=guests&notice=guest-removed",
    );
  });

  it("confirmRemoveGuest says so when nothing was removed", async () => {
    const { db, client } = setup();
    await expect(
      confirmRemoveGuest(form(entries()), opts(client)),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });
    expect(db.tables.guests).toHaveLength(2);
    expect(redirect).toHaveBeenCalledWith(
      "/admin/households/h1?tab=guests&notice=guest-not-removed",
    );
  });
});

describe("setGuestDietary", () => {
  it("adds an allergy with details", async () => {
    const { db, client } = setup();
    const result = await setGuestDietary(
      null,
      form([
        ["household_id", "h1"],
        ["guest_id", "g1"],
        ["op", "add"],
        ["category_key", "tree-nuts"],
        ["severity", "allergy"],
        ["details", " Carries an EpiPen "],
      ]),
      opts(client),
    );
    expect(result).toEqual({ ok: true });
    expect(db.tables.guest_dietary).toContainEqual(
      expect.objectContaining({
        guest_id: "g1",
        category_key: "tree-nuts",
        severity: "allergy",
        details: "Carries an EpiPen",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/households/h1");
  });

  it("changes severity when the category is already there", async () => {
    const { db, client } = setup();
    await setGuestDietary(
      null,
      form([
        ["household_id", "h1"],
        ["guest_id", "g1"],
        ["op", "add"],
        ["category_key", "vegetarian"],
        ["severity", "allergy"],
      ]),
      opts(client),
    );
    const mine = db.tables.guest_dietary.filter(
      (d) => d.guest_id === "g1" && d.category_key === "vegetarian",
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].severity).toBe("allergy");
  });

  it("removes an entry", async () => {
    const { db, client } = setup();
    const result = await setGuestDietary(
      null,
      form([
        ["household_id", "h1"],
        ["guest_id", "g1"],
        ["op", "remove"],
        ["category_key", "vegetarian"],
      ]),
      opts(client),
    );
    expect(result).toEqual({ ok: true });
    expect(db.tables.guest_dietary).toEqual([]);
  });

  it("only accepts allergy or preference", async () => {
    const { db, client } = setup();
    const result = await setGuestDietary(
      null,
      form([
        ["household_id", "h1"],
        ["guest_id", "g1"],
        ["op", "add"],
        ["category_key", "tree-nuts"],
        ["severity", "sometimes"],
      ]),
      opts(client),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { severity: expect.any(String) },
    });
    expect(db.tables.guest_dietary).toHaveLength(1);
  });
});
