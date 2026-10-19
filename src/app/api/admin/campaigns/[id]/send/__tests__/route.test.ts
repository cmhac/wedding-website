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
const mockSend = jest.fn();
jest.mock("@/lib/campaigns/dispatch", () => ({
  ...jest.requireActual("@/lib/campaigns/dispatch"),
  sendCampaign: (...a: unknown[]) => mockSend(...a),
}));

import { AuthError } from "@/lib/auth/guards";
import { DispatchError } from "@/lib/campaigns/dispatch";
import { POST } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const result = {
  campaign_id: ID,
  queued: 3,
  sent: 2,
  skipped: { no_email: 1, opted_out: 0, other: 0 },
  failed: 1,
};

const call = (id = ID) =>
  POST(
    new Request(`http://localhost/api/admin/campaigns/${id}/send`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({ kind: "staff", role: "planner" });
  mockSend.mockResolvedValue(result);
});

describe("POST /api/admin/campaigns/[id]/send", () => {
  it("returns 401 without a session", async () => {
    mockRequireStaff.mockRejectedValue(new AuthError(401, "unauthenticated"));
    expect((await call()).status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await call()).status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns the send summary for staff", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(mockSend).toHaveBeenCalledWith({ fake: "admin" }, ID);
  });

  it("returns 404 for an id that is not a uuid", async () => {
    expect((await call("nope")).status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown campaign", async () => {
    mockSend.mockRejectedValue(new DispatchError("campaign_not_found"));
    expect((await call()).status).toBe(404);
  });

  it("returns 409 unless the campaign is a draft or scheduled", async () => {
    mockSend.mockRejectedValue(new DispatchError("campaign_not_sendable"));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("campaign_not_sendable");
  });

  it("returns 409 template_missing", async () => {
    mockSend.mockRejectedValue(new DispatchError("template_missing"));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("template_missing");
  });

  it("returns 500 for an unexpected failure, without details", async () => {
    mockSend.mockRejectedValue(new Error("boom test@example.com"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("example.com");
  });

  it("is safe to repeat: a second call after completion is a 409, not a resend", async () => {
    mockSend
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new DispatchError("campaign_not_sendable"));
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(409);
  });
});
