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

const H1 = "5f1c2b8e-1111-4222-8333-944455556666";
const H2 = "5f1c2b8e-1111-4222-8333-944455557777";
const post = (body: unknown, raw = false) =>
  POST(
    new Request("http://localhost:3000/api/admin/households/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
const counts = {
  marked: 2,
  cleared: 0,
  already: 0,
  declinedSkipped: 1,
  householdsWithoutPhone: 0,
  households: 2,
  dryRun: true,
};
const staffClient = { rpc: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({ supabase: staffClient });
  mockSet.mockResolvedValue({ ok: true, counts });
});

describe("POST /api/admin/households/consent", () => {
  it("marks a batch with the staff member's own client and returns the counts", async () => {
    const res = await post({
      household_ids: [H1, H2],
      mode: "mark",
      note: "address form",
      dry_run: true,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      counts: {
        marked: 2,
        cleared: 0,
        already: 0,
        declined_skipped: 1,
        households_without_phone: 0,
        households: 2,
        dry_run: true,
      },
    });
    expect(mockSet).toHaveBeenCalledWith(staffClient, {
      householdIds: [H1, H2],
      mode: "mark",
      overrideDeclined: undefined,
      note: "address form",
      dryRun: true,
    });
  });

  it.each([
    [{}],
    [{ household_ids: [], mode: "mark" }],
    [{ household_ids: ["nope"], mode: "mark" }],
    [{ household_ids: [H1], mode: "other" }],
    [{ household_ids: [H1], mode: "mark", note: "x".repeat(201) }],
  ])("refuses %j with 422", async (body) => {
    expect((await post(body)).status).toBe(422);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    expect((await post("{", true)).status).toBe(422);
  });

  it("is 401 not signed in and 403 not staff, before anything is read", async () => {
    mockRequireStaff.mockRejectedValue(new AuthError(401, "unauthenticated"));
    expect((await post({ household_ids: [H1], mode: "mark" })).status).toBe(
      401,
    );
    mockRequireStaff.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await post({ household_ids: [H1], mode: "mark" })).status).toBe(
      403,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  it.each([
    ["forbidden", 403],
    ["not_found", 404],
    ["declined_needs_override", 409],
    ["invalid_payload", 422],
    ["failed", 500],
  ])("answers the database error %s with %i", async (code, status) => {
    mockSet.mockResolvedValue({ ok: false, code });
    expect((await post({ household_ids: [H1], mode: "mark" })).status).toBe(
      status,
    );
  });
});
