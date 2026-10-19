/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ fake: "admin" }),
}));
const mockCreate = jest.fn();
jest.mock("@/lib/guests/household-access", () => ({
  createHouseholdWithAccess: (...a: unknown[]) => mockCreate(...a),
}));

import { AuthError } from "@/lib/auth/guards";
import { POST } from "../route";

const body = {
  display_name: "Test Household",
  contact_email: "test@example.com",
  plus_one_allowance: 1,
  guests: [{ first_name: "Ann", last_name: "Example" }],
};

const request = (b: unknown) =>
  new Request("http://localhost:3000/api/admin/households", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

const household = {
  id: "5f1c2b8e-1111-4222-8333-944455556666",
  display_name: "Test Household",
  contact_email: "test@example.com",
  auth_user_id: "user-1",
  plus_one_allowance: 1,
  paper_only: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({ kind: "staff", role: "couple" });
  mockCreate.mockResolvedValue({ ok: true, household, guestIds: ["g1"] });
});

describe("POST /api/admin/households", () => {
  it("returns 401 without a session", async () => {
    mockRequireStaff.mockRejectedValue(new AuthError(401, "unauthenticated"));
    expect((await POST(request(body))).status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await POST(request(body))).status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the household with its guests and returns 201 without the auth user id", async () => {
    const res = await POST(request(body));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      { fake: "admin" },
      expect.objectContaining({
        display_name: "Test Household",
        contact_email: "test@example.com",
        guests: body.guests,
      }),
    );
    const json = await res.json();
    expect(json.guest_ids).toEqual(["g1"]);
    expect(json.household.id).toBe(household.id);
    expect(json.household).not.toHaveProperty("auth_user_id");
  });

  it("returns 409 email_in_use without naming any other household", async () => {
    mockCreate.mockResolvedValue({ ok: false, code: "email_in_use" });
    const res = await POST(request(body));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("email_in_use");
    expect(JSON.stringify(json)).not.toContain("@");
  });

  it("returns 422 for an invalid body and malformed JSON", async () => {
    expect(
      (await POST(request({ display_name: "X", guests: [] }))).status,
    ).toBe(422);
    expect((await POST(request("{nope"))).status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when creation fails", async () => {
    mockCreate.mockResolvedValue({ ok: false, code: "failed" });
    expect((await POST(request(body))).status).toBe(500);
  });
});
