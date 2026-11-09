/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
const staffClient = { fake: "staff" };
const mockAdd = jest.fn();
jest.mock("@/lib/guests/household-access", () => ({
  addHouseholdContact: (...a: unknown[]) => mockAdd(...a),
}));

import { AuthError } from "@/lib/auth/guards";
import { POST } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const post = (body: unknown, id = ID) =>
  POST(
    new Request(`http://localhost:3000/api/admin/households/${id}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
const valid = { kind: "email", value: "New@Example.test" };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "planner",
    supabase: staffClient,
  });
  mockAdd.mockResolvedValue({ ok: true, contactId: "c1" });
});

describe("POST /api/admin/households/[id]/contacts", () => {
  it.each([
    [401, new AuthError(401, "unauthenticated")],
    [403, new AuthError(403, "forbidden")],
  ])("answers %i when the guard refuses", async (status, err) => {
    mockRequireStaff.mockRejectedValueOnce(err);
    expect((await post(valid)).status).toBe(status);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("adds the address through the staff session and answers 201", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(mockAdd).toHaveBeenCalledWith(staffClient, ID, "New@Example.test");
    expect(await res.json()).toEqual({
      contact: { id: "c1", kind: "email", value: "new@example.test" },
    });
  });

  it.each([
    ["email_in_use", 409],
    ["staff_account", 409],
    ["not_found", 404],
    ["invalid_payload", 422],
  ])("maps %s to %i without naming an address", async (code, status) => {
    mockAdd.mockResolvedValue({ ok: false, code });
    const res = await post(valid);
    expect(res.status).toBe(status);
    const json = await res.json();
    expect(json.error.code).toBe(code);
    expect(JSON.stringify(json)).not.toContain("@");
  });

  it("answers 500 for any other failure", async () => {
    mockAdd.mockResolvedValue({ ok: false, code: "failed" });
    expect((await post(valid)).status).toBe(500);
  });

  it("answers 422 for a bad address, an unknown kind or invalid JSON", async () => {
    expect((await post({ kind: "email", value: "nope" })).status).toBe(422);
    expect((await post({ kind: "sms", value: "a@example.test" })).status).toBe(
      422,
    );
    expect((await post("{nope")).status).toBe(422);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed household id", async () => {
    expect((await post(valid, "not-a-uuid")).status).toBe(404);
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
