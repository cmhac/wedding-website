/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/log");
import { AuthError } from "@/lib/auth/guards";

const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
const mockSet = jest.fn();
jest.mock("@/lib/sms/consent-marks", () => ({
  setSmsConsent: (...a: unknown[]) => mockSet(...a),
}));

import { POST } from "../route";

const H = "5f1c2b8e-1111-4222-8333-944455556666";
const C = "5f1c2b8e-1111-4222-8333-944455558888";
const call = (body: unknown, id = H, cid = C) =>
  POST(
    new Request("http://localhost:3000/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id, cid }) },
  );
const counts = {
  marked: 1,
  cleared: 0,
  already: 0,
  declinedSkipped: 0,
  householdsWithoutPhone: 0,
  households: 1,
  dryRun: false,
};
const staffClient = { rpc: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({ supabase: staffClient });
  mockSet.mockResolvedValue({ ok: true, counts });
});

describe("POST /api/admin/households/[id]/phones/[cid]/consent", () => {
  it("marks one number with the staff member's own client", async () => {
    const res = await call({ mode: "mark", note: "by phone" });
    expect(res.status).toBe(200);
    expect((await res.json()).counts.marked).toBe(1);
    expect(mockSet).toHaveBeenCalledWith(staffClient, {
      householdIds: [H],
      contactId: C,
      mode: "mark",
      overrideDeclined: undefined,
      note: "by phone",
    });
  });

  it("passes the override for a number that declined", async () => {
    await call({ mode: "mark", override_declined: true });
    expect(mockSet.mock.calls[0][1].overrideDeclined).toBe(true);
  });

  it("asks for confirmation (409) when the number declined and there is no override", async () => {
    mockSet.mockResolvedValue({ ok: false, code: "declined_needs_override" });
    const res = await call({ mode: "mark" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("declined_needs_override");
  });

  it("is 404 for ids that are not ids, and 422 for a bad body", async () => {
    expect((await call({ mode: "mark" }, "nope")).status).toBe(404);
    expect((await call({ mode: "mark" }, H, "nope")).status).toBe(404);
    expect((await call({ mode: "x" })).status).toBe(422);
  });

  it("is 401 not signed in and 403 not staff", async () => {
    mockRequireStaff.mockRejectedValue(new AuthError(401, "unauthenticated"));
    expect((await call({ mode: "mark" })).status).toBe(401);
    mockRequireStaff.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await call({ mode: "mark" })).status).toBe(403);
  });
});
