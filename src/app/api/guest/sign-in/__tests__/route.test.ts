/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
jest.mock("server-only", () => ({}), { virtual: true });
const mockSignInWithOtp = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { signInWithOtp: mockSignInWithOtp },
  }),
}));

const contactMaybeSingle = jest.fn();
const contactEq2 = jest.fn((_c: string, _v: string) => ({
  maybeSingle: contactMaybeSingle,
}));
const contactEq1 = jest.fn((_c: string, _v: string) => ({ eq: contactEq2 }));
const from = jest.fn((_t: string) => ({
  select: (_c: string) => ({ eq: contactEq1 }),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ from }),
}));
const mockAllow = jest.fn();
jest.mock("@/lib/auth/sign-in-limits", () => ({
  addressHash: (e: string) => `hash:${e.trim().toLowerCase()}`,
  allowSignInAttempt: (...a: unknown[]) => mockAllow(...a),
}));
const mockToken = jest.fn();
jest.mock("@/lib/auth/household-session", () => ({
  generateHouseholdTokenHash: (...a: unknown[]) => mockToken(...a),
}));
const mockRender = jest.fn();
jest.mock("@/lib/email/templates", () => ({
  ...jest.requireActual("@/lib/email/templates"),
  renderTemplate: (...a: unknown[]) => mockRender(...a),
}));
const mockSend = jest.fn();
jest.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => mockSend(...a),
}));
jest.mock("@/lib/log");
const mockLimiter = jest.fn((_key: string) => true);
jest.mock("@/lib/rate-limit", () => ({
  ...jest.requireActual("@/lib/rate-limit"),
  createRateLimiter: () => ({ check: (k: string) => mockLimiter(k) }),
}));
const mockMinimum = jest.fn();
jest.mock("@/lib/sign-in-timing", () => ({
  withMinimumDuration: async (ms: number, work: () => Promise<unknown>) => {
    mockMinimum(ms);
    await work().catch(() => {});
  },
}));

import { log } from "@/lib/log";
import { TemplateError } from "@/lib/email/templates";
import { POST } from "../route";

const NEUTRAL = {
  message: "If that address is on the guest list, a link is on its way.",
};

function request(body: unknown, raw = false) {
  return new Request("http://localhost:3000/api/guest/sign-in", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "6.6.6.6, 1.2.3.4",
    },
    body: raw ? (body as string) : JSON.stringify(body),
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
  mockLimiter.mockReturnValue(true);
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  mockAllow.mockResolvedValue(true);
  contactMaybeSingle.mockResolvedValue({
    data: { household_id: "h1" },
    error: null,
  });
  mockToken.mockResolvedValue("token-hash-1");
  mockRender.mockResolvedValue({ subject: "s", html: "<p>h</p>", text: "t" });
  mockSend.mockResolvedValue({ ok: true, providerMessageId: "m1" });
});

describe("POST /api/guest/sign-in: a known address", () => {
  it("sends one email to exactly the typed address, rendered from magic_link for a guest", async () => {
    const res = await POST(request({ email: "Second@Example.test" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
    expect(contactEq1).toHaveBeenCalledWith("kind", "email");
    expect(contactEq2).toHaveBeenCalledWith("value", "second@example.test");
    expect(mockToken).toHaveBeenCalledWith("h1");
    expect(mockRender).toHaveBeenCalledWith("magic_link", {
      sign_in_url:
        "http://localhost:3000/auth/confirm?token_hash=token-hash-1&type=email",
      audience: "guest",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      to: "Second@Example.test",
    });
  });

  it("never asks Supabase to send its own email", async () => {
    await POST(request({ email: "guest@example.test" }));
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("applies the durable limit to the hashed address, not the address", async () => {
    await POST(request({ email: "Guest@Example.test" }));
    expect(mockAllow).toHaveBeenCalledWith(
      expect.anything(),
      "hash:guest@example.test",
    );
  });
});

describe.each([
  [
    "an unknown address",
    () => contactMaybeSingle.mockResolvedValue({ data: null, error: null }),
    "unknown",
  ],
  [
    "a failed address lookup",
    () =>
      contactMaybeSingle.mockResolvedValue({
        data: null,
        error: { message: "x@y.z" },
      }),
    "lookup_failed",
  ],
  [
    "the limit being reached",
    () => mockAllow.mockResolvedValue(false),
    "limited",
  ],
  [
    "a household with no sign-in account",
    () => mockToken.mockResolvedValue(null),
    "no_token",
  ],
  [
    "a missing template",
    () =>
      mockRender.mockRejectedValue(
        new TemplateError("template_missing", "magic_link"),
      ),
    "template_missing",
  ],
  [
    "a failing template",
    () => mockRender.mockRejectedValue(new Error("boom")),
    "template_failed",
  ],
  [
    "a failed send",
    () => mockSend.mockResolvedValue({ ok: false, code: "send_failed" }),
    "send_failed",
  ],
  [
    "a thrown error",
    () => mockSend.mockRejectedValue(new Error("net guest@example.test")),
    "exception",
  ],
])("%s", (_name, arrange, outcome) => {
  it("answers the same neutral 202, logging only an outcome code", async () => {
    arrange();
    const res = await POST(request({ email: "guest@example.test" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
    expect(loggedText()).toContain(outcome);
    expect(loggedText()).not.toContain("example.test");
    expect(loggedText()).not.toContain("token-hash");
  });
});

describe("POST /api/guest/sign-in: what is not sent", () => {
  it.each([
    [
      "an unknown address",
      () => contactMaybeSingle.mockResolvedValue({ data: null, error: null }),
    ],
    ["a limit being reached", () => mockAllow.mockResolvedValue(false)],
  ])("sends nothing for %s", async (_n, arrange) => {
    arrange();
    await POST(request({ email: "guest@example.test" }));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("checks the limit before looking the address up", async () => {
    mockAllow.mockResolvedValue(false);
    await POST(request({ email: "guest@example.test" }));
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/guest/sign-in: request handling", () => {
  it("answers 422 for a malformed email, missing body, or invalid JSON", async () => {
    const res = await POST(request({ email: "not-an-email" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.issues).toBeDefined();
    expect((await POST(request("{nope", true))).status).toBe(422);
    expect((await POST(request({}))).status).toBe(422);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("answers 429 when the per-IP limiter refuses, doing nothing else", async () => {
    mockLimiter.mockReturnValue(false);
    const res = await POST(request({ email: "guest@example.test" }));
    expect(res.status).toBe(429);
    expect(mockAllow).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("limits by the trusted client address, not the leftmost forwarded hop", async () => {
    await POST(request({ email: "guest@example.test" }));
    const keys = mockLimiter.mock.calls.map((c) => c[0]);
    expect(keys).toContain("1.2.3.4");
    expect(keys).not.toContain("6.6.6.6");
  });

  it("takes a fixed minimum time (at least 1.5 seconds) whatever the outcome", async () => {
    await POST(request({ email: "guest@example.test" }));
    contactMaybeSingle.mockResolvedValue({ data: null, error: null });
    await POST(request({ email: "other@example.test" }));
    expect(mockMinimum).toHaveBeenCalledTimes(2);
    for (const [ms] of mockMinimum.mock.calls)
      expect(ms).toBeGreaterThanOrEqual(1500);
  });

  it("never echoes the email address back", async () => {
    const res = await POST(request({ email: "guest@example.test" }));
    expect(JSON.stringify(await res.json())).not.toContain(
      "guest@example.test",
    );
  });
});
