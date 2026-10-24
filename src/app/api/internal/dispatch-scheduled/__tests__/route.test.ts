/** @jest-environment node */
jest.mock("@/lib/log");
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ fake: "admin" }),
}));
const mockDispatch = jest.fn();
jest.mock("@/lib/campaigns/dispatch", () => ({
  ...jest.requireActual("@/lib/campaigns/dispatch"),
  dispatchDueCampaigns: (...a: unknown[]) => mockDispatch(...a),
}));

import { POST } from "../route";

const SECRET = "test-cron-secret";
const call = (authorization?: string) =>
  POST(
    new Request("http://localhost/api/internal/dispatch-scheduled", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockDispatch.mockResolvedValue({
    campaigns: [
      { campaign_id: "c-1", ok: true, result: {} },
      { campaign_id: "c-2", ok: false, code: "template_missing" },
    ],
  });
});

describe("POST /api/internal/dispatch-scheduled", () => {
  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer wrong"],
    ["a secret of the wrong length", "Bearer x"],
    ["no Bearer prefix", SECRET],
    ["an empty bearer", "Bearer "],
  ])("returns 401 with %s", async (_label, header) => {
    const res = await call(header);
    expect(res.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("runs the due campaigns with the exact secret", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledWith({ fake: "admin" });
    expect(await res.json()).toEqual({
      campaigns: [
        { campaign_id: "c-1", ok: true },
        { campaign_id: "c-2", ok: false, code: "template_missing" },
      ],
    });
  });

  it("uses a constant-time comparison", () => {
    const source = jest
      .requireActual<typeof import("fs")>("fs")
      .readFileSync(require.resolve("../route"), "utf8");
    expect(source).toContain("timingSafeEqual");
  });

  it("returns 500 without details when the dispatch itself fails", async () => {
    mockDispatch.mockRejectedValue(new Error("boom test@example.com"));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("example.com");
  });
});
