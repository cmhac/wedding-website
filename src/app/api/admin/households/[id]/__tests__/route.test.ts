/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
const adminClient = { fake: "admin" };
const staffClient = { fake: "staff", from: jest.fn(), rpc: jest.fn() };
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => adminClient,
}));
const mockDelete = jest.fn();
jest.mock("@/lib/guests/household-access", () => ({
  deleteHouseholdWithAccess: (...a: unknown[]) => mockDelete(...a),
}));

import { AuthError } from "@/lib/auth/guards";
import { DELETE, PATCH } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const patch = (b: unknown, id = ID) =>
  PATCH(
    new Request(`http://localhost:3000/api/admin/households/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    }),
    ctx(id),
  );
const del = (id = ID) =>
  DELETE(
    new Request(`http://localhost:3000/api/admin/households/${id}`, {
      method: "DELETE",
    }),
    ctx(id),
  );

const household = {
  id: ID,
  display_name: "Test Household",
  auth_user_id: null,
  plus_one_allowance: 0,
};

/**
 * Fake of the staff-session update. The write returns only the id (staff-only
 * columns cannot be read back from the table); the saved row is then read
 * through the staff-only `staff_households` function, and the household's
 * addresses are counted for the summary.
 */
function fakeUpdate(
  result: { data: unknown; error: unknown },
  contactCount = 0,
) {
  const written = result.error
    ? result
    : { data: { id: ID }, error: null as unknown };
  const updateChain: Record<string, unknown> = {
    eq: jest.fn(() => updateChain),
    select: jest.fn(() => updateChain),
    single: jest.fn(async () => written),
  };
  const update = jest.fn(() => updateChain);
  const countEq = jest.fn(async () => ({ count: contactCount, error: null }));
  const countSelect = jest.fn(() => ({ eq: countEq }));
  staffClient.from.mockImplementation((table: string) =>
    table === "household_contacts" ? { select: countSelect } : { update },
  );
  const readChain: Record<string, unknown> = {
    eq: jest.fn(() => readChain),
    single: jest.fn(async () => result),
  };
  staffClient.rpc.mockReturnValue(readChain);
  return { update, updateChain, countSelect, countEq };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "planner",
    supabase: staffClient,
  });
  mockDelete.mockResolvedValue({ ok: true });
});

describe("PATCH /api/admin/households/[id]", () => {
  it("returns 401 without a session and 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    expect((await patch({ display_name: "X" })).status).toBe(401);
    mockRequireStaff.mockRejectedValueOnce(new AuthError(403, "forbidden"));
    expect((await patch({ display_name: "X" })).status).toBe(403);
    expect(staffClient.from).not.toHaveBeenCalled();
  });

  it("updates the household's own fields and reads the saved row back", async () => {
    const { update, updateChain } = fakeUpdate({
      data: { ...household, display_name: "Renamed" },
      error: null,
    });
    const res = await patch({ display_name: "Renamed" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ display_name: "Renamed" });
    // Never `select("*")`: staff-only columns are not readable from the table.
    expect(updateChain.select).toHaveBeenCalledWith("id");
    expect(staffClient.rpc).toHaveBeenCalledWith("staff_households");
    const json = await res.json();
    expect(json.household.display_name).toBe("Renamed");
    expect(json.household).not.toHaveProperty("auth_user_id");
  });

  it("reports the address count and the paper-only state", async () => {
    fakeUpdate({ data: { ...household }, error: null }, 2);
    const two = await (await patch({ display_name: "A" })).json();
    expect(two.household).toMatchObject({
      contact_count: 2,
      paper_only: false,
    });
    fakeUpdate({ data: { ...household }, error: null }, 0);
    const none = await (await patch({ display_name: "A" })).json();
    expect(none.household).toMatchObject({
      contact_count: 0,
      paper_only: true,
    });
  });

  it("no longer changes addresses: contact fields are refused", async () => {
    expect((await patch({ contact_email: "new@example.com" })).status).toBe(
      422,
    );
    expect((await patch({ contacts: [] })).status).toBe(422);
    expect(staffClient.from).not.toHaveBeenCalled();
  });

  it("returns 404 for a malformed id", async () => {
    expect((await patch({ display_name: "X" }, "not-a-uuid")).status).toBe(404);
  });

  it("returns 404 when the household does not exist", async () => {
    fakeUpdate({ data: null, error: { code: "PGRST116" } });
    expect((await patch({ display_name: "X" })).status).toBe(404);
  });

  it("returns 422 for an empty body or unknown fields", async () => {
    expect((await patch({})).status).toBe(422);
    expect((await patch({ auth_user_id: "x" })).status).toBe(422);
  });
});

describe("DELETE /api/admin/households/[id]", () => {
  it("returns 401 without a session and 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    expect((await del()).status).toBe(401);
    mockRequireStaff.mockRejectedValueOnce(new AuthError(403, "forbidden"));
    expect((await del()).status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the household through the staff session, returning 204", async () => {
    const res = await del();
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(adminClient, staffClient, ID);
  });

  it("returns 404 for an unknown household", async () => {
    mockDelete.mockResolvedValue({ ok: false, code: "not_found" });
    expect((await del()).status).toBe(404);
  });
});
