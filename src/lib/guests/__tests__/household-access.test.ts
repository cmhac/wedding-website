/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import {
  createHouseholdWithAccess,
  deleteHouseholdWithAccess,
  linkPendingHouseholdAccounts,
  updateHouseholdContactEmail,
} from "../household-access";

type Row = Record<string, unknown>;

/** In-memory fake of the pieces of the service-role client these helpers use. */
function fakeAdmin(
  options: {
    households?: Row[];
    authEmailExists?: boolean;
    failGuestInsert?: boolean;
  } = {},
) {
  const tables: Record<string, Row[]> = {
    households: options.households ?? [],
    guests: [],
  };
  let nextId = 1;
  const createUser = jest.fn(async (attrs: { email: string }) =>
    options.authEmailExists
      ? { data: { user: null }, error: { code: "email_exists" } }
      : {
          data: { user: { id: `user-${nextId++}`, email: attrs.email } },
          error: null,
        },
  );
  const updateUserById = jest.fn(async (_id: string, _attrs: object) => ({
    data: { user: {} },
    error: options.authEmailExists ? { code: "email_exists" } : null,
  }));
  const deleteUser = jest.fn(async (_id: string) => ({ error: null }));

  function from(table: string) {
    const rows = tables[table];
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] = {};
    const run = () => {
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === "insert") {
        if (table === "guests" && options.failGuestInsert) {
          return { data: null, error: { message: "boom" } };
        }
        const list = (Array.isArray(payload) ? payload : [payload]).map(
          (p) => ({ id: `${table}-${nextId++}`, ...p }),
        );
        rows.push(...list);
        return { data: list, error: null };
      }
      if (mode === "update") {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      if (mode === "delete") {
        tables[table] = rows.filter((r) => !matched.includes(r));
        if (table === "households") {
          const ids = matched.map((m) => m.id);
          tables.guests = tables.guests.filter(
            (g) => !ids.includes(g.household_id),
          );
        }
        return { data: matched, error: null };
      }
      return { data: matched, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: Row | Row[]) => ((mode = "insert"), (payload = p), b),
      update: (p: Row) => ((mode = "update"), (payload = p), b),
      delete: () => ((mode = "delete"), b),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      not: (k: string, _op: string, v: unknown) => (
        filters.push((r) => r[k] !== v),
        b
      ),
      single: async () => {
        const res = run();
        const d = res.data as Row[] | null;
        return d && d[0]
          ? { data: d[0], error: null }
          : { data: null, error: res.error ?? { message: "none" } };
      },
      maybeSingle: async () => {
        const res = run();
        return { data: (res.data as Row[] | null)?.[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return b;
  }

  return {
    admin: {
      auth: { admin: { createUser, updateUserById, deleteUser } },
      from,
    },
    tables,
    createUser,
    updateUserById,
    deleteUser,
  };
}

const guests = [{ first_name: "Ann", last_name: "Example" }];

describe("createHouseholdWithAccess", () => {
  it("creates the Auth user, the household linked to it, and the guests", async () => {
    const f = fakeAdmin();
    const res = await createHouseholdWithAccess(f.admin as never, {
      display_name: "Test Household",
      contact_email: "Test@Example.com",
      plus_one_allowance: 1,
      guests,
    });
    expect(res.ok).toBe(true);
    expect(f.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        email_confirm: true,
      }),
    );
    expect(f.tables.households[0]).toMatchObject({
      contact_email: "test@example.com",
      auth_user_id: "user-1",
    });
    expect(f.tables.guests).toHaveLength(1);
    if (res.ok) {
      expect(res.household.paper_only).toBe(false);
      expect(res.household.auth_user_id).toBe("user-1");
    }
  });

  it("creates a paper-only household without an Auth user when there is no email", async () => {
    const f = fakeAdmin();
    const res = await createHouseholdWithAccess(f.admin as never, {
      display_name: "Paper Household",
      contact_email: null,
      guests,
    });
    expect(f.createUser).not.toHaveBeenCalled();
    expect(res.ok && res.household.paper_only).toBe(true);
    expect(f.tables.households[0].auth_user_id).toBeNull();
  });

  it("returns email_in_use when another household has the email, creating nothing", async () => {
    const f = fakeAdmin({
      households: [{ id: "h-other", contact_email: "taken@example.com" }],
    });
    const res = await createHouseholdWithAccess(f.admin as never, {
      display_name: "Second",
      contact_email: "taken@example.com",
      guests,
    });
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.createUser).not.toHaveBeenCalled();
    expect(f.tables.households).toHaveLength(1);
  });

  it("returns email_in_use when the Auth user already exists", async () => {
    const f = fakeAdmin({ authEmailExists: true });
    const res = await createHouseholdWithAccess(f.admin as never, {
      display_name: "Second",
      contact_email: "someone@example.com",
      guests,
    });
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.tables.households).toHaveLength(0);
  });

  it("rolls back the household and the Auth user when the guests fail", async () => {
    const f = fakeAdmin({ failGuestInsert: true });
    const res = await createHouseholdWithAccess(f.admin as never, {
      display_name: "Test Household",
      contact_email: "test@example.com",
      guests,
    });
    expect(res).toEqual({ ok: false, code: "failed" });
    expect(f.tables.households).toHaveLength(0);
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("never puts an email address in a failure result", async () => {
    const f = fakeAdmin({ failGuestInsert: true });
    const res = await createHouseholdWithAccess(f.admin as never, {
      display_name: "Test Household",
      contact_email: "test@example.com",
      guests,
    });
    expect(JSON.stringify(res)).not.toContain("@");
  });
});

describe("updateHouseholdContactEmail", () => {
  it("updates the linked Auth user and the household row", async () => {
    const f = fakeAdmin({
      households: [
        { id: "h1", contact_email: "old@example.com", auth_user_id: "u1" },
      ],
    });
    const res = await updateHouseholdContactEmail(
      f.admin as never,
      "h1",
      "new@example.com",
    );
    expect(f.updateUserById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ email: "new@example.com" }),
    );
    expect(f.tables.households[0]).toMatchObject({
      contact_email: "new@example.com",
      auth_user_id: "u1",
    });
    expect(res.ok && res.household.paper_only).toBe(false);
  });

  it("creates and links an Auth user when the household had none", async () => {
    const f = fakeAdmin({
      households: [{ id: "h1", contact_email: null, auth_user_id: null }],
    });
    await updateHouseholdContactEmail(
      f.admin as never,
      "h1",
      "new@example.com",
    );
    expect(f.createUser).toHaveBeenCalled();
    expect(f.tables.households[0].auth_user_id).toBe("user-1");
  });

  it("unlinks the user and marks the household paper-only when cleared", async () => {
    const f = fakeAdmin({
      households: [
        { id: "h1", contact_email: "old@example.com", auth_user_id: "u1" },
      ],
    });
    const res = await updateHouseholdContactEmail(f.admin as never, "h1", null);
    expect(f.deleteUser).toHaveBeenCalledWith("u1");
    expect(f.tables.households[0]).toMatchObject({
      contact_email: null,
      auth_user_id: null,
    });
    expect(res.ok && res.household.paper_only).toBe(true);
  });

  it("returns email_in_use when another household has the email, changing nothing", async () => {
    const f = fakeAdmin({
      households: [
        { id: "h1", contact_email: "old@example.com", auth_user_id: "u1" },
        { id: "h2", contact_email: "taken@example.com", auth_user_id: "u2" },
      ],
    });
    const res = await updateHouseholdContactEmail(
      f.admin as never,
      "h1",
      "taken@example.com",
    );
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.tables.households[0].contact_email).toBe("old@example.com");
  });

  it("returns not_found for an unknown household", async () => {
    const f = fakeAdmin();
    const res = await updateHouseholdContactEmail(
      f.admin as never,
      "missing",
      "a@example.com",
    );
    expect(res).toEqual({ ok: false, code: "not_found" });
  });

  it("allows saving the household's own current email again", async () => {
    const f = fakeAdmin({
      households: [
        { id: "h1", contact_email: "same@example.com", auth_user_id: "u1" },
      ],
    });
    const res = await updateHouseholdContactEmail(
      f.admin as never,
      "h1",
      "SAME@example.com",
    );
    expect(res.ok).toBe(true);
  });
});

describe("deleteHouseholdWithAccess", () => {
  it("deletes the household, its guests, and the Auth user", async () => {
    const f = fakeAdmin({
      households: [
        { id: "h1", contact_email: "a@example.com", auth_user_id: "u1" },
      ],
    });
    f.tables.guests.push({ id: "g1", household_id: "h1" });
    const res = await deleteHouseholdWithAccess(f.admin as never, "h1");
    expect(res).toEqual({ ok: true });
    expect(f.tables.households).toHaveLength(0);
    expect(f.tables.guests).toHaveLength(0);
    expect(f.deleteUser).toHaveBeenCalledWith("u1");
  });

  it("returns not_found for an unknown household", async () => {
    const f = fakeAdmin();
    expect(await deleteHouseholdWithAccess(f.admin as never, "x")).toEqual({
      ok: false,
      code: "not_found",
    });
  });
});

describe("linkPendingHouseholdAccounts", () => {
  it("creates and links Auth users for households that have an email but no user", async () => {
    const f = fakeAdmin({
      households: [
        { id: "h1", contact_email: "a@example.com", auth_user_id: null },
        { id: "h2", contact_email: null, auth_user_id: null },
        { id: "h3", contact_email: "c@example.com", auth_user_id: "u3" },
      ],
    });
    const res = await linkPendingHouseholdAccounts(f.admin as never);
    expect(res).toEqual({ linked: 1, failed: 0 });
    expect(f.tables.households[0].auth_user_id).toBe("user-1");
  });
});
