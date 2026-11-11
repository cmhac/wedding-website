/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/log");

const mockConfigured = jest.fn();
jest.mock("@/lib/sms/state", () => ({
  isSmsConfigured: (...a: unknown[]) => mockConfigured(...a),
}));
const mockValid = jest.fn();
jest.mock("@/lib/sms/twilio", () => ({
  isValidTwilioSignature: (...a: unknown[]) => mockValid(...a),
}));
const mockRpc = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

import { log } from "@/lib/log";
import { POST } from "../route";

function post(
  fields: Record<string, string>,
  signature: string | null = "sig",
) {
  return new Request("http://localhost:3000/api/webhooks/twilio", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(signature ? { "x-twilio-signature": signature } : {}),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

const loggedText = () =>
  JSON.stringify([
    ...(log.info as jest.Mock).mock.calls,
    ...(log.warn as jest.Mock).mock.calls,
    ...(log.error as jest.Mock).mock.calls,
  ]);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://hannahandchris.wedding";
  mockConfigured.mockReturnValue(true);
  mockValid.mockReturnValue(true);
  mockRpc.mockResolvedValue({ data: "applied", error: null });
});

describe("POST /api/webhooks/twilio", () => {
  it("checks the signature over the public URL and every posted field", async () => {
    await POST(
      post(
        {
          MessageSid: "SM1",
          MessageStatus: "delivered",
          AccountSid: "AC1",
          To: "+12025550123",
        },
        "abc",
      ),
    );
    expect(mockValid).toHaveBeenCalledWith(
      "abc",
      "https://hannahandchris.wedding/api/webhooks/twilio",
      {
        MessageSid: "SM1",
        MessageStatus: "delivered",
        AccountSid: "AC1",
        To: "+12025550123",
      },
    );
  });

  it.each([
    ["a wrong signature", () => mockValid.mockReturnValue(false), "sig"],
    ["a missing signature", () => {}, null],
  ])("answers 403 and records nothing for %s", async (_n, arrange, sig) => {
    arrange();
    if (sig === null) mockValid.mockReturnValue(false);
    const res = await POST(
      post({ MessageSid: "SM1", MessageStatus: "delivered" }, sig),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("invalid_signature");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["queued", "sending"],
    ["sending", "sending"],
    ["sent", "sent"],
    ["delivered", "delivered"],
    ["undelivered", "failed"],
    ["failed", "failed"],
  ])(
    "records %s as %s with an event key that makes a repeat harmless",
    async (twilio, ours) => {
      const res = await POST(
        post({ MessageSid: "SM1", MessageStatus: twilio, ErrorCode: "30006" }),
      );
      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith(
        "record_text_status",
        expect.objectContaining({
          provider_event_id: `SM1:${twilio}`,
          provider_message_id: "SM1",
          status: ours,
          error_code: "30006",
        }),
      );
    },
  );

  it("passes no error code when there is none", async () => {
    await POST(post({ MessageSid: "SM1", MessageStatus: "delivered" }));
    expect(mockRpc.mock.calls[0][1].error_code).toBeNull();
  });

  it.each(["read", "accepted", "received"])(
    "acknowledges and ignores %s",
    async (status) => {
      const res = await POST(
        post({ MessageSid: "SM1", MessageStatus: status }),
      );
      expect(res.status).toBe(200);
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it("acknowledges a notification with no message id without recording it", async () => {
    expect((await POST(post({ MessageStatus: "delivered" }))).status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 500 when saving fails, so Twilio retries", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(
      (await POST(post({ MessageSid: "SM1", MessageStatus: "delivered" })))
        .status,
    ).toBe(500);
  });

  it("answers 200 and does nothing at all when texting is not configured", async () => {
    mockConfigured.mockReturnValue(false);
    const res = await POST(
      post({ MessageSid: "SM1", MessageStatus: "delivered" }),
    );
    expect(res.status).toBe(200);
    expect(mockValid).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("never logs a number or a message id", async () => {
    await POST(
      post({
        MessageSid: "SM1",
        MessageStatus: "failed",
        To: "+12025550123",
        ErrorCode: "30003",
      }),
    );
    expect(loggedText()).not.toContain("2025550123");
    expect(loggedText()).not.toContain("SM1");
  });
});
