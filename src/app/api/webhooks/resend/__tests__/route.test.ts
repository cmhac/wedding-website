/** @jest-environment node */
jest.mock("@/lib/log");
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}));
const mockRpc = jest.fn();
const mockVerify = jest.fn();
jest.mock("@/lib/email/resend", () => ({
  getResend: () => ({ webhooks: { verify: (o: unknown) => mockVerify(o) } }),
}));

import { shouldAdvance, type MessageStatus } from "@/lib/campaigns/status";
import { statusForEventType } from "@/lib/campaigns/status";
import { POST } from "../route";

const event = (type = "email.delivered", emailId = "provider-1") => ({
  type,
  created_at: "2026-10-19T12:00:00.000Z",
  data: { email_id: emailId },
});

function request(
  body: unknown,
  headers: Record<string, string> = {
    "svix-id": "msg_1",
    "svix-timestamp": "1760875200",
    "svix-signature": "v1,test",
  },
) {
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
  mockVerify.mockImplementation(({ payload }: { payload: string }) =>
    JSON.parse(payload),
  );
  mockRpc.mockResolvedValue({ data: true, error: null });
});

describe("POST /api/webhooks/resend", () => {
  it("returns 400 on a bad signature and records nothing", async () => {
    mockVerify.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(request(event()));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("verifies the raw body with the svix headers and the secret", async () => {
    const raw = '{"type":"email.sent",  "data":{"email_id":"p"}}';
    await POST(request(raw));
    const arg = mockVerify.mock.calls[0][0];
    expect(arg.payload).toBe(raw);
    expect(arg.webhookSecret).toBe("test-webhook-secret");
    expect(arg.headers.id).toBe("msg_1");
    expect(arg.headers.signature).toBe("v1,test");
  });

  it("returns 400 when the secret is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await POST(request(event()))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.complained",
  ])("records %s using the svix id as the event id", async (type) => {
    const res = await POST(request(event(type)));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("record_message_event", {
      provider_event_id: "msg_1",
      provider_message_id: "provider-1",
      type,
      occurred_at: "2026-10-19T12:00:00.000Z",
    });
  });

  it("returns 200 for a duplicate svix id, which the database ignores", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const res = await POST(request(event()));
    expect(res.status).toBe(200);
  });

  it("returns 200 for an unknown message id", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect((await POST(request(event("email.sent", "not-ours")))).status).toBe(
      200,
    );
  });

  it.each([
    "email.opened",
    "email.clicked",
    "email.delivery_delayed",
    "domain.created",
  ])("returns 200 and ignores %s", async (type) => {
    const res = await POST(request(event(type)));
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 200 and ignores a payload with no email id", async () => {
    const res = await POST(
      request({ type: "email.sent", created_at: "x", data: {} }),
    );
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 500 when the database call fails, so Resend retries", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "x" } });
    expect((await POST(request(event()))).status).toBe(500);
  });

  it("never regresses a status when events arrive out of order", async () => {
    // Stand in for the database function, using the shared ranking rule.
    let status: MessageStatus = "sending";
    const seen = new Set<string>();
    mockRpc.mockImplementation(
      async (
        _fn: string,
        args: { provider_event_id: string; type: string },
      ) => {
        if (seen.has(args.provider_event_id))
          return { data: false, error: null };
        seen.add(args.provider_event_id);
        const next = statusForEventType(args.type)!;
        if (shouldAdvance(status, next)) status = next;
        return { data: true, error: null };
      },
    );
    const send = (id: string, type: string) =>
      POST(request(event(type), { ...baseHeaders, "svix-id": id }));
    const baseHeaders = {
      "svix-id": "",
      "svix-timestamp": "1",
      "svix-signature": "v1,test",
    };
    await send("e1", "email.delivered");
    await send("e2", "email.sent"); // late: must not move delivered back to sent
    expect(status).toBe("delivered");
    await send("e3", "email.bounced");
    await send("e4", "email.delivered"); // late: terminal status stays
    await send("e3", "email.bounced"); // duplicate
    expect(status).toBe("bounced");
  });
});
