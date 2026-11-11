/** @jest-environment node */
jest.mock("@/lib/log");
jest.mock("server-only", () => ({}), { virtual: true });
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
jest.mock("@/lib/sms/state", () => ({ isSmsConfigured: () => true }));

import { AuthError } from "@/lib/auth/guards";
import { DispatchError } from "@/lib/campaigns/dispatch";
import { POST } from "../route";

const HOUSEHOLD = "5f1c2b8e-1111-4222-8333-944455556666";
const summary = {
  campaign_id: "5f1c2b8e-1111-4222-8333-944455557777",
  households: 1,
  addresses: 1,
  queued: 1,
  sent: 1,
  skipped: { no_email: 0, opted_out: 0, other: 0 },
  failed: 0,
};

const inserted: Record<string, unknown>[] = [];
const staffClient = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: table === "households" ? { id: HOUSEHOLD } : null,
          error: null,
        }),
      }),
    }),
    insert: async (row: Record<string, unknown>) => {
      inserted.push({ table, ...row });
      return { error: null };
    },
  }),
};

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/admin/campaigns/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  inserted.length = 0;
  mockRequireStaff.mockResolvedValue({ supabase: staffClient });
  mockSend.mockResolvedValue(summary);
});

describe("POST /api/admin/campaigns/test", () => {
  it("creates a test campaign for one household and sends it through the real send path", async () => {
    const res = await call({
      message_type_key: "save_the_date",
      channel: "both",
      household_id: HOUSEHOLD,
    });
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      table: "campaigns",
      message_type_key: "save_the_date",
      audience: { scope: "household", household_id: HOUSEHOLD },
      status: "draft",
      is_test: true,
      channel: "both",
      name: "Test: save_the_date",
    });
    expect(mockSend).toHaveBeenCalledWith({ fake: "admin" }, inserted[0].id);
    expect((await res.json()).campaign_id).toBe(summary.campaign_id);
  });

  it.each([
    [{}],
    [{ message_type_key: "nope", channel: "email", household_id: HOUSEHOLD }],
    [
      {
        message_type_key: "save_the_date",
        channel: "fax",
        household_id: HOUSEHOLD,
      },
    ],
    [
      {
        message_type_key: "save_the_date",
        channel: "email",
        household_id: "x",
      },
    ],
  ])("refuses %j with 422", async (body) => {
    expect((await call(body)).status).toBe(422);
    expect(inserted).toHaveLength(0);
  });

  it("is 404 for a household that does not exist", async () => {
    mockRequireStaff.mockResolvedValue({
      supabase: {
        ...staffClient,
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: async () => ({ error: null }),
        }),
      },
    });
    const res = await call({
      message_type_key: "save_the_date",
      channel: "email",
      household_id: HOUSEHOLD,
    });
    expect(res.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("maps a missing email template to a plain 409", async () => {
    mockSend.mockRejectedValue(new DispatchError("template_missing"));
    const res = await call({
      message_type_key: "save_the_date",
      channel: "email",
      household_id: HOUSEHOLD,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("template_missing");
  });

  it("is 401 not signed in and 403 not staff", async () => {
    mockRequireStaff.mockRejectedValue(new AuthError(401, "unauthenticated"));
    expect((await call({})).status).toBe(401);
    mockRequireStaff.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await call({})).status).toBe(403);
  });
});
