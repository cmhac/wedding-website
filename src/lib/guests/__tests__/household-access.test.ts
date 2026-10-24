/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import {
  createHouseholdWithAccess,
  deleteHouseholdWithAccess,
  linkHouseholdAccounts,
  updateHouseholdContactEmail,
} from "../household-access";

type Row = Record<string, unknown>;
type RpcReply = { data: unknown; error: unknown };

/**
 * Fakes of the two clients the helpers use: the service-role client (sign-in
 * accounts and reads) and the signed-in staff member's client (the staff-only
 * database functions, so changes are attributed to the staff member).
 */
function fakes(
  options: {
    households?: Row[];
    staffUserIds?: string[];
    authEmailExists?: boolean;
    rpcErrors?: Record<string, string>;
  } = {},
) {
  const households = options.households ?? [];
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

  const selectFrom = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () =>
      table === "households"
        ? households
        : (options.staffUserIds ?? []).map((user_id) => ({ user_id }));
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      in: (k: string, v: unknown[]) => (
        filters.push((r) => v.includes(r[k])),
        b
      ),
      not: (k: string, _op: string, v: unknown) => (
        filters.push((r) => r[k] !== v),
        b
      ),
      maybeSingle: async () => ({
        data: rows().find((r) => filters.every((f) => f(r))) ?? null,
        error: null,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: rows().filter((r) => filters.every((f) => f(r))),
          error: null,
        }),
    };
    return b;
  };

  const rpcResults: Record<string, unknown> = {
    create_household_record: {
      household_id: "h-new",
      guest_ids: ["g1"],
      invitations: 0,
    },
    set_household_contact: { previous_auth_user_id: null },
    delete_household_record: { auth_user_id: null, auth_user_is_staff: false },
  };
  const rpc = jest.fn(async (fn: string, _args: object): Promise<RpcReply> =>
    options.rpcErrors?.[fn]
      ? { data: null, error: { message: options.rpcErrors[fn] } }
      : { data: rpcResults[fn], error: null },
  );

  return {
    admin: {
      auth: { admin: { createUser, updateUserById, deleteUser } },
      from: selectFrom,
    } as never,
    staff: { rpc, from: selectFrom } as never,
    rpc,
    rpcResults,
    createUser,
    updateUserById,
    deleteUser,
  };
}

const guests = [{ first_name: "Ann", last_name: "Example" }];

describe("createHouseholdWithAccess", () => {
  it("creates the sign-in account, then the household through the staff-only function", async () => {
    const f = fakes();
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Test Household",
      contact_email: "Test@Example.com",
      plus_one_allowance: 1,
      guests,
    });
    expect(f.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        email_confirm: true,
      }),
    );
    expect(f.rpc).toHaveBeenCalledWith("create_household_record", {
      payload: expect.objectContaining({
        display_name: "Test Household",
        contact_email: "test@example.com",
        auth_user_id: "user-1",
        plus_one_allowance: 1,
        guests: [expect.objectContaining({ first_name: "Ann" })],
      }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.household).toMatchObject({
        id: "h-new",
        paper_only: false,
        auth_user_id: "user-1",
      });
      expect(res.guestIds).toEqual(["g1"]);
    }
  });

  it("creates a paper-only household without a sign-in account when there is no email", async () => {
    const f = fakes();
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Paper Household",
      contact_email: null,
      guests,
    });
    expect(f.createUser).not.toHaveBeenCalled();
    expect(res.ok && res.household.paper_only).toBe(true);
  });

  it("returns email_in_use when the sign-in account already exists, calling no database function", async () => {
    const f = fakes({ authEmailExists: true });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Second",
      contact_email: "someone@example.com",
      guests,
    });
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("removes the new sign-in account and returns email_in_use when the database refuses the email", async () => {
    const f = fakes({ rpcErrors: { create_household_record: "email_in_use" } });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Second",
      contact_email: "taken@example.com",
      guests,
    });
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns invalid_payload when the database rejects the household", async () => {
    const f = fakes({
      rpcErrors: { create_household_record: "invalid_payload" },
    });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Test",
      contact_email: null,
      guests,
    });
    expect(res).toEqual({ ok: false, code: "invalid_payload" });
  });

  it("removes the sign-in account and fails on any other database error", async () => {
    const f = fakes({ rpcErrors: { create_household_record: "boom" } });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Test",
      contact_email: "test@example.com",
      guests,
    });
    expect(res).toEqual({ ok: false, code: "failed" });
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
    expect(JSON.stringify(res)).not.toContain("@");
  });
});

describe("updateHouseholdContactEmail", () => {
  const current = {
    id: "h1",
    display_name: "Test Household",
    contact_email: "old@example.com",
    auth_user_id: "u1",
    plus_one_allowance: 0,
  };

  it("updates the linked sign-in account, then records the change through the staff-only function", async () => {
    const f = fakes({ households: [{ ...current }] });
    const res = await updateHouseholdContactEmail(
      f.admin,
      f.staff,
      "h1",
      "New@example.com",
    );
    expect(f.updateUserById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ email: "new@example.com" }),
    );
    expect(f.rpc).toHaveBeenCalledWith("set_household_contact", {
      household_id: "h1",
      contact_email: "new@example.com",
      auth_user_id: "u1",
    });
    expect(res.ok && res.household.paper_only).toBe(false);
  });

  it("creates and links a sign-in account when the household had none", async () => {
    const f = fakes({
      households: [{ ...current, contact_email: null, auth_user_id: null }],
    });
    await updateHouseholdContactEmail(
      f.admin,
      f.staff,
      "h1",
      "new@example.com",
    );
    expect(f.createUser).toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledWith("set_household_contact", {
      household_id: "h1",
      contact_email: "new@example.com",
      auth_user_id: "user-1",
    });
  });

  it("unlinks and removes the account when the email is cleared, making the household paper-only", async () => {
    const f = fakes({ households: [{ ...current }] });
    f.rpcResults.set_household_contact = { previous_auth_user_id: "u1" };
    const res = await updateHouseholdContactEmail(f.admin, f.staff, "h1", null);
    expect(f.rpc).toHaveBeenCalledWith("set_household_contact", {
      household_id: "h1",
      contact_email: null,
      auth_user_id: null,
    });
    expect(f.deleteUser).toHaveBeenCalledWith("u1");
    expect(res.ok && res.household.paper_only).toBe(true);
  });

  it("refuses to change the email of a staff member's account, touching nothing", async () => {
    const f = fakes({ households: [{ ...current }], staffUserIds: ["u1"] });
    const res = await updateHouseholdContactEmail(
      f.admin,
      f.staff,
      "h1",
      "attacker@example.com",
    );
    expect(res).toEqual({ ok: false, code: "staff_account" });
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("keeps the account when it belongs to a staff member", async () => {
    const f = fakes({ households: [{ ...current }], staffUserIds: ["u1"] });
    f.rpcResults.set_household_contact = { previous_auth_user_id: "u1" };
    await updateHouseholdContactEmail(f.admin, f.staff, "h1", null);
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it("returns email_in_use when the sign-in system refuses the email, changing nothing", async () => {
    const f = fakes({ households: [{ ...current }], authEmailExists: true });
    const res = await updateHouseholdContactEmail(
      f.admin,
      f.staff,
      "h1",
      "taken@example.com",
    );
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("puts the account email back and returns email_in_use when the database refuses the email", async () => {
    const f = fakes({
      households: [{ ...current }],
      rpcErrors: { set_household_contact: "email_in_use" },
    });
    const res = await updateHouseholdContactEmail(
      f.admin,
      f.staff,
      "h1",
      "taken@example.com",
    );
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.updateUserById).toHaveBeenLastCalledWith(
      "u1",
      expect.objectContaining({ email: "old@example.com" }),
    );
  });

  it("removes a newly created account when the database call fails", async () => {
    const f = fakes({
      households: [{ ...current, contact_email: null, auth_user_id: null }],
      rpcErrors: { set_household_contact: "boom" },
    });
    const res = await updateHouseholdContactEmail(
      f.admin,
      f.staff,
      "h1",
      "new@example.com",
    );
    expect(res).toEqual({ ok: false, code: "failed" });
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns not_found for an unknown household", async () => {
    const f = fakes();
    const res = await updateHouseholdContactEmail(
      f.admin,
      f.staff,
      "missing",
      "a@example.com",
    );
    expect(res).toEqual({ ok: false, code: "not_found" });
  });
});

describe("deleteHouseholdWithAccess", () => {
  it("deletes through the staff-only function and removes the sign-in account", async () => {
    const f = fakes();
    f.rpcResults.delete_household_record = {
      auth_user_id: "u1",
      auth_user_is_staff: false,
    };
    const res = await deleteHouseholdWithAccess(f.admin, f.staff, "h1");
    expect(res).toEqual({ ok: true });
    expect(f.rpc).toHaveBeenCalledWith("delete_household_record", {
      household_id: "h1",
    });
    expect(f.deleteUser).toHaveBeenCalledWith("u1");
  });

  it("does not remove the sign-in account when it belongs to a staff member", async () => {
    const f = fakes();
    f.rpcResults.delete_household_record = {
      auth_user_id: "u1",
      auth_user_is_staff: true,
    };
    expect(await deleteHouseholdWithAccess(f.admin, f.staff, "h1")).toEqual({
      ok: true,
    });
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown household", async () => {
    const f = fakes({ rpcErrors: { delete_household_record: "not_found" } });
    expect(await deleteHouseholdWithAccess(f.admin, f.staff, "x")).toEqual({
      ok: false,
      code: "not_found",
    });
  });
});

describe("linkHouseholdAccounts", () => {
  const rows = [
    { id: "h1", contact_email: "a@example.com", auth_user_id: null },
    { id: "h2", contact_email: null, auth_user_id: null },
    { id: "h3", contact_email: "c@example.com", auth_user_id: "u3" },
    { id: "h4", contact_email: "d@example.com", auth_user_id: null },
  ];

  it("links only the listed households that have an email and no account, through the staff-only function", async () => {
    const f = fakes({ households: rows });
    const res = await linkHouseholdAccounts(f.admin, ["h1", "h2", "h3"], {
      staff: f.staff,
    });
    expect(res).toEqual({ linked: 1, failed: 0 });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith("set_household_contact", {
      household_id: "h1",
      contact_email: "a@example.com",
      auth_user_id: "user-1",
    });
  });

  it("counts a failure and removes the account when the link cannot be saved", async () => {
    const f = fakes({
      households: rows,
      rpcErrors: { set_household_contact: "boom" },
    });
    const res = await linkHouseholdAccounts(f.admin, ["h1"], {
      staff: f.staff,
    });
    expect(res).toEqual({ linked: 0, failed: 1 });
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("does nothing for an empty list", async () => {
    const f = fakes({ households: rows });
    expect(await linkHouseholdAccounts(f.admin, [])).toEqual({
      linked: 0,
      failed: 0,
    });
    expect(f.createUser).not.toHaveBeenCalled();
  });
});
