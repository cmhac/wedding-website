/** @jest-environment node */
import { Webhook } from "standardwebhooks";

const mockRegistry: Record<string, unknown> = {};
jest.mock("../../../../../../emails", () => ({
  __esModule: true,
  get default() {
    return mockRegistry;
  },
}));
const mockSend = jest.fn();
jest.mock("@/lib/email/resend", () => ({
  getResend: () => ({ emails: { send: mockSend } }),
}));

import { POST } from "../route";

const base64 = Buffer.from("test-secret-bytes-0123456789").toString("base64");

function request(body: unknown, opts: { sign?: boolean; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = {};
  if (opts.sign !== false) {
    const now = new Date();
    headers["webhook-id"] = "msg_1";
    headers["webhook-timestamp"] = String(Math.floor(now.getTime() / 1000));
    headers["webhook-signature"] = new Webhook(base64).sign("msg_1", now, raw);
  }
  return new Request("http://localhost/api/auth/send-email", {
    method: "POST",
    body: raw,
    headers,
  });
}

const payload = (
  type = "magiclink",
  redirect = "http://localhost:3000/rsvp",
) => ({
  user: { email: "test@example.com" },
  email_data: {
    token: "123456",
    token_hash: "hash",
    redirect_to: redirect,
    email_action_type: type,
  },
});

const template = jest.fn(() => ({
  subject: "fixture subject",
  html: "<p>fixture</p>",
  text: "fixture",
}));

beforeEach(() => {
  process.env.SEND_EMAIL_HOOK_SECRET = `v1,whsec_${base64}`;
  process.env.EMAIL_FROM = "Test <noreply@example.com>";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  for (const k of Object.keys(mockRegistry)) delete mockRegistry[k];
  mockSend.mockReset().mockResolvedValue({ data: { id: "r1" }, error: null });
  template.mockClear();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("POST /api/auth/send-email", () => {
  it("returns 401 with no body for a missing signature", async () => {
    mockRegistry.magic_link = template;
    const res = await POST(request(payload(), { sign: false }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 401 with no body for a bad signature", async () => {
    const req = request(payload());
    const tampered = new Request(req.url, {
      method: "POST",
      body: JSON.stringify({ ...payload(), extra: 1 }),
      headers: req.headers,
    });
    const res = await POST(tampered);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
  });

  it("renders the magic_link template and sends via Resend", async () => {
    mockRegistry.magic_link = template;
    const res = await POST(request(payload()));
    expect(res.status).toBe(200);
    expect(template).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: "guest",
        sign_in_url: expect.stringContaining("/auth/v1/verify?token=hash"),
      }),
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      to: "test@example.com",
      subject: "fixture subject",
    });
  });

  it("marks admin redirects as the staff audience", async () => {
    mockRegistry.magic_link = template;
    await POST(request(payload("magiclink", "http://localhost:3000/admin")));
    expect(template).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "staff" }),
    );
  });

  it("returns 500 template_missing when no template is registered", async () => {
    const res = await POST(request(payload()));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("template_missing");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 500 template_failed when the template throws", async () => {
    mockRegistry.magic_link = () => {
      throw new Error("boom");
    };
    const res = await POST(request(payload()));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("template_failed");
  });

  it("returns 200 without sending for other action types", async () => {
    mockRegistry.magic_link = template;
    const res = await POST(request(payload("signup")));
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 500 when Resend fails, without leaking the address", async () => {
    mockRegistry.magic_link = template;
    mockSend.mockResolvedValue({ data: null, error: { name: "rate_limit" } });
    const res = await POST(request(payload()));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("test@example.com");
  });

  it("gives the same response shape whatever the address", async () => {
    mockRegistry.magic_link = template;
    const a = await POST(request(payload()));
    const other = payload();
    other.user.email = "someone-else@example.com";
    const b = await POST(request(other));
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
  });
});
