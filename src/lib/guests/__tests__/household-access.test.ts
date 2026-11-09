/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import {
  addHouseholdContact,
  createHouseholdWithAccess,
  deleteHouseholdWithAccess,
  householdAccountEmail,
  removeHouseholdContact,
  updateHouseholdContact,
} from "../household-access";

type RpcReply = { data: unknown; error: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Fakes of the two clients the helpers use: the service-role client (sign-in
 * accounts) and the signed-in staff member's client (the staff-only database
 * functions, so changes are attributed to the staff member).
 */
function fakes(
  options: {
    authFails?: boolean;
    rpcErrors?: Record<string, string>;
  } = {},
) {
  let nextId = 1;
  const createUser = jest.fn(async (attrs: { email: string }) =>
    options.authFails
      ? { data: { user: null }, error: { code: "unexpected_failure" } }
      : {
          data: { user: { id: `user-${nextId++}`, email: attrs.email } },
          error: null,
        },
  );
  const updateUserById = jest.fn(async (_id: string, _attrs: object) => ({
    data: { user: {} },
    error: null,
  }));
  const deleteUser = jest.fn(async (_id: string) => ({ error: null }));

  const rpcResults: Record<string, unknown> = {
    create_household_record: {
      household_id: "h-new",
      guest_ids: ["g1"],
      invitations: 0,
    },
    add_household_contact: "contact-1",
    update_household_contact: null,
    remove_household_contact: { paper_only: false },
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
    } as never,
    staff: { rpc } as never,
    rpc,
    rpcResults,
    createUser,
    updateUserById,
    deleteUser,
  };
}

const guests = [{ first_name: "Ann", last_name: "Example" }];
const email = (value: string) => ({ kind: "email" as const, value });

describe("householdAccountEmail", () => {
  it("builds the synthetic address from the household id", () => {
    expect(householdAccountEmail("abc", "households.invalid")).toBe(
      "household-abc@households.invalid",
    );
  });

  it("defaults the domain to households.invalid", () => {
    delete process.env.HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN;
    expect(householdAccountEmail("abc")).toBe(
      "household-abc@households.invalid",
    );
  });
});

describe("createHouseholdWithAccess", () => {
  it("creates a synthetic sign-in account, then the household through the staff-only function", async () => {
    const f = fakes();
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Test Household",
      contacts: [email("Test@Example.com"), email("two@example.com")],
      plus_one_allowance: 1,
      guests,
    });
    const created = f.createUser.mock.calls[0][0] as { email: string };
    expect(created).toEqual(expect.objectContaining({ email_confirm: true }));
    const match = /^household-(.+)@households\.invalid$/.exec(created.email);
    expect(match?.[1]).toMatch(UUID);
    expect(created.email).not.toContain("example.com");
    expect(f.rpc).toHaveBeenCalledWith("create_household_record", {
      payload: expect.objectContaining({
        id: match?.[1],
        display_name: "Test Household",
        contacts: ["test@example.com", "two@example.com"],
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
        contact_count: 2,
        auth_user_id: "user-1",
      });
      expect(res.guestIds).toEqual(["g1"]);
    }
  });

  it("still creates the sign-in account for a paper-only household", async () => {
    const f = fakes();
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Paper Household",
      contacts: [],
      guests,
    });
    expect(f.createUser).toHaveBeenCalledTimes(1);
    expect(res.ok && res.household.paper_only).toBe(true);
    expect(res.ok && res.household.auth_user_id).toBe("user-1");
  });

  it("removes the new sign-in account and returns email_in_use when the database refuses an address", async () => {
    const f = fakes({ rpcErrors: { create_household_record: "email_in_use" } });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Second",
      contacts: [email("taken@example.com")],
      guests,
    });
    expect(res).toEqual({ ok: false, code: "email_in_use" });
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns staff_account when an address belongs to a staff account", async () => {
    const f = fakes({
      rpcErrors: { create_household_record: "staff_account" },
    });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Second",
      contacts: [email("staff@example.com")],
      guests,
    });
    expect(res).toEqual({ ok: false, code: "staff_account" });
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns invalid_payload when the database rejects the household", async () => {
    const f = fakes({
      rpcErrors: { create_household_record: "invalid_payload" },
    });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Test",
      contacts: [],
      guests,
    });
    expect(res).toEqual({ ok: false, code: "invalid_payload" });
  });

  it("fails without calling the database when the sign-in account cannot be created", async () => {
    const f = fakes({ authFails: true });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Test",
      contacts: [],
      guests,
    });
    expect(res).toEqual({ ok: false, code: "failed" });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("removes the sign-in account and fails on any other database error, naming no address", async () => {
    const f = fakes({ rpcErrors: { create_household_record: "boom" } });
    const res = await createHouseholdWithAccess(f.admin, f.staff, {
      display_name: "Test",
      contacts: [email("test@example.com")],
      guests,
    });
    expect(res).toEqual({ ok: false, code: "failed" });
    expect(f.deleteUser).toHaveBeenCalledWith("user-1");
    expect(JSON.stringify(res)).not.toContain("@");
  });
});

describe("household contacts", () => {
  it("adds an address through the staff-only function, never touching the sign-in system", async () => {
    const f = fakes();
    const res = await addHouseholdContact(f.staff, "h1", "New@Example.com");
    expect(f.rpc).toHaveBeenCalledWith("add_household_contact", {
      household_id: "h1",
      value: "new@example.com",
    });
    expect(res).toEqual({ ok: true, contactId: "contact-1" });
    expect(f.createUser).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it("changes an address through the staff-only function", async () => {
    const f = fakes();
    const res = await updateHouseholdContact(
      f.staff,
      "h1",
      "c1",
      "Other@Example.com",
    );
    expect(f.rpc).toHaveBeenCalledWith("update_household_contact", {
      household_id: "h1",
      contact_id: "c1",
      value: "other@example.com",
    });
    expect(res).toEqual({ ok: true });
    expect(f.updateUserById).not.toHaveBeenCalled();
  });

  it("removes an address and reports when the household is now paper-only", async () => {
    const f = fakes();
    f.rpcResults.remove_household_contact = { paper_only: true };
    const res = await removeHouseholdContact(f.staff, "h1", "c1");
    expect(f.rpc).toHaveBeenCalledWith("remove_household_contact", {
      household_id: "h1",
      contact_id: "c1",
    });
    expect(res).toEqual({ ok: true, paperOnly: true });
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["email_in_use"],
    ["staff_account"],
    ["invalid_payload"],
    ["not_found"],
  ])("passes the %s failure through, with no address in it", async (code) => {
    const f = fakes({ rpcErrors: { add_household_contact: code } });
    const res = await addHouseholdContact(f.staff, "h1", "a@example.com");
    expect(res).toEqual({ ok: false, code });
    expect(JSON.stringify(res)).not.toContain("@");
  });

  it("turns any other database error into failed", async () => {
    const f = fakes({ rpcErrors: { remove_household_contact: "boom" } });
    expect(await removeHouseholdContact(f.staff, "h1", "c1")).toEqual({
      ok: false,
      code: "failed",
    });
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
