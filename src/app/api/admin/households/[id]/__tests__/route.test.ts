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
const mockUpdateEmail = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/lib/guests/household-access", () => ({
  updateHouseholdContactEmail: (...a: unknown[]) => mockUpdateEmail(...a),
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
  contact_email: null,
  auth_user_id: null,
  plus_one_allowance: 0,
  paper_only: true,
};

/**
 * Fake of the staff-session update used for non-email fields. The write returns
 * only the id (staff-only columns cannot be read back from the table); the
 * saved row is then read through the staff-only `staff_households` function.
 */
function fakeOtherFieldsUpdate(result: { data: unknown; error: unknown }) {
  const written = result.error
    ? result
    : { data: { id: ID }, error: null as unknown };
  const updateChain: Record<string, unknown> = {
    eq: jest.fn(() => updateChain),
    select: jest.fn(() => updateChain),
    single: jest.fn(async () => written),
  };
  const update = jest.fn(() => updateChain);
  staffClient.from.mockReturnValue({ update });
  const readChain: Record<string, unknown> = {
    eq: jest.fn(() => readChain),
    single: jest.fn(async () => result),
  };
  staffClient.rpc.mockReturnValue(readChain);
  return { update, updateChain };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "planner",
    supabase: staffClient,
  });
  mockUpdateEmail.mockResolvedValue({ ok: true, household });
  mockDelete.mockResolvedValue({ ok: true });
});

describe("PATCH /api/admin/households/[id]", () => {
  it("returns 401 without a session and 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    expect((await patch({ contact_email: null })).status).toBe(401);
    mockRequireStaff.mockRejectedValueOnce(new AuthError(403, "forbidden"));
    expect((await patch({ contact_email: null })).status).toBe(403);
    expect(mockUpdateEmail).not.toHaveBeenCalled();
  });

  it("changes the contact email through the household-access helper", async () => {
    mockUpdateEmail.mockResolvedValue({
      ok: true,
      household: {
        ...household,
        contact_email: "new@example.com",
        auth_user_id: "u1",
        paper_only: false,
      },
    });
    const res = await patch({ contact_email: "new@example.com" });
    expect(res.status).toBe(200);
    expect(mockUpdateEmail).toHaveBeenCalledWith(
      adminClient,
      staffClient,
      ID,
      "new@example.com",
    );
    const json = await res.json();
    expect(json.household.paper_only).toBe(false);
    expect(json.household).not.toHaveProperty("auth_user_id");
  });

  it("clears the email, which marks the household paper-only", async () => {
    const res = await patch({ contact_email: null });
    expect(res.status).toBe(200);
    expect(mockUpdateEmail).toHaveBeenCalledWith(
      adminClient,
      staffClient,
      ID,
      null,
    );
    expect((await res.json()).household.paper_only).toBe(true);
  });

  it("returns 409 email_in_use naming no other household's data", async () => {
    mockUpdateEmail.mockResolvedValue({ ok: false, code: "email_in_use" });
    const res = await patch({ contact_email: "taken@example.com" });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("email_in_use");
    expect(JSON.stringify(json)).not.toContain("@");
  });

  it("returns 409 staff_account when the household is linked to a staff account", async () => {
    mockUpdateEmail.mockResolvedValue({ ok: false, code: "staff_account" });
    const res = await patch({ contact_email: "new@example.com" });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("staff_account");
    expect(JSON.stringify(json)).not.toContain("@");
  });

  it("returns 422 invalid_payload when the database rejects the email", async () => {
    mockUpdateEmail.mockResolvedValue({ ok: false, code: "invalid_payload" });
    const res = await patch({ contact_email: "new@example.com" });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("invalid_payload");
  });

  it("returns 404 for an unknown or malformed id", async () => {
    mockUpdateEmail.mockResolvedValue({ ok: false, code: "not_found" });
    expect((await patch({ contact_email: null })).status).toBe(404);
    expect((await patch({ contact_email: null }, "not-a-uuid")).status).toBe(
      404,
    );
  });

  it("returns 422 for an empty body or unknown fields", async () => {
    expect((await patch({})).status).toBe(422);
    expect((await patch({ auth_user_id: "x" })).status).toBe(422);
  });

  it("updates other fields without touching the sign-in account", async () => {
    const { update, updateChain } = fakeOtherFieldsUpdate({
      data: { ...household, display_name: "Renamed" },
      error: null,
    });
    const res = await patch({ display_name: "Renamed" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ display_name: "Renamed" });
    // Never `select("*")`: staff-only columns are not readable from the table.
    expect(updateChain.select).toHaveBeenCalledWith("id");
    expect(staffClient.rpc).toHaveBeenCalledWith("staff_households");
    expect(mockUpdateEmail).not.toHaveBeenCalled();
    expect((await res.json()).household.display_name).toBe("Renamed");
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
