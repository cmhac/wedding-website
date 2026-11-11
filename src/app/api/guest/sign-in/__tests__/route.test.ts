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
const householdMaybeSingle = jest.fn();
const from = jest.fn((table: string) => ({
  select: (_c: string) =>
    table === "households"
      ? {
          eq: (_k: string, _v: string) => ({
            maybeSingle: householdMaybeSingle,
          }),
        }
      : { eq: contactEq1 },
}));
const mockRpc = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from,
    rpc: (...a: unknown[]) => mockRpc(...a),
  }),
}));
const mockState = jest.fn();
jest.mock("@/lib/sms/state", () => ({
  getSmsState: (...a: unknown[]) => mockState(...a),
}));
const mockSendText = jest.fn();
jest.mock("@/lib/sms/send", () => ({
  sendText: (...a: unknown[]) => mockSendText(...a),
}));
const mockConfirm = jest.fn();
jest.mock("@/lib/sms/consent", () => ({
  sendConfirmationText: (...a: unknown[]) => mockConfirm(...a),
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
  message:
    "If that address is on the guest list or belongs to a staff account, a link is on its way.",
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
  mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
  mockState.mockResolvedValue({
    configured: false,
    enabled: false,
    available: false,
  });
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
    "an address on neither list",
    () => {
      contactMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockSignInWithOtp.mockResolvedValue({
        data: {},
        error: { code: "user_not_found" },
      });
    },
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

describe("POST /api/guest/sign-in: a staff address", () => {
  beforeEach(() => {
    contactMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("asks for the staff link, sends no household email, and answers the neutral 202", async () => {
    const res = await POST(request({ email: "Planner@Example.test" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
    expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "Planner@Example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "http://localhost:3000/auth/callback?audience=staff",
      },
    });
    expect(mockToken).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(loggedText()).toContain("staff_requested");
    expect(loggedText()).not.toContain("example.test");
  });

  it("answers the same neutral 202 when Supabase refuses or fails, logging only a code", async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "user_not_found" },
    });
    const refused = await POST(request({ email: "nobody@example.test" }));
    mockSignInWithOtp.mockRejectedValue(new Error("down nobody@example.test"));
    const failed = await POST(request({ email: "nobody@example.test" }));
    for (const res of [refused, failed]) {
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual(NEUTRAL);
    }
    expect(loggedText()).toContain("unknown");
    expect(loggedText()).not.toContain("example.test");
  });

  it("does not look for a staff account when the household lookup itself failed", async () => {
    contactMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "x" },
    });
    await POST(request({ email: "planner@example.test" }));
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("does not look for a staff account when the limit was reached", async () => {
    mockAllow.mockResolvedValue(false);
    await POST(request({ email: "planner@example.test" }));
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("makes no Supabase call for a household's internal account address", async () => {
    delete process.env.HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN;
    const res = await POST(
      request({ email: "household-1@households.invalid" }),
    );
    expect(res.status).toBe(202);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("still waits the full minimum time, as for any other address", async () => {
    await POST(request({ email: "planner@example.test" }));
    expect(mockMinimum).toHaveBeenCalledWith(1500);
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

// ---- Phone numbers (texting available) --------------------------------------

const NEUTRAL_BOTH = {
  message:
    "If that email address or mobile number is on the guest list, or belongs to a staff account, a link is on its way.",
};

function available() {
  mockState.mockResolvedValue({
    configured: true,
    enabled: true,
    available: true,
  });
  process.env.INVITE_LINK_SECRET =
    "test-invite-secret-long-enough-for-hmac-0123456789";
  householdMaybeSingle.mockResolvedValue({
    data: { invite_link_version: 2 },
    error: null,
  });
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === "find_phone_contact")
      return {
        data: {
          household_id: "5f1c2b8e-1111-4222-8333-944455556666",
          contact_id: "c1",
        },
        error: null,
      };
    if (fn === "record_sms_consent_for_number")
      return {
        data: { found: true, contact_id: "c1", newly_opted_in: true },
        error: null,
      };
    throw new Error(`unexpected rpc ${fn}`);
  });
  mockSendText.mockResolvedValue({ ok: true, sid: "SM1" });
  mockConfirm.mockResolvedValue({ ok: true });
}

describe("POST /api/guest/sign-in: a typed phone number", () => {
  beforeEach(available);

  it("records the opt-in, confirms once, then texts the timed link to that number only", async () => {
    const res = await POST(
      request({ identifier: "(202) 555-0123", sms_consent: true }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL_BOTH);
    expect(mockAllow).toHaveBeenCalledWith(
      expect.anything(),
      "hash:+12025550123",
    );
    expect(mockRpc).toHaveBeenCalledWith("find_phone_contact", {
      value: "+12025550123",
    });
    expect(mockRpc).toHaveBeenCalledWith("record_sms_consent_for_number", {
      household_id: "5f1c2b8e-1111-4222-8333-944455556666",
      value: "+12025550123",
    });
    expect(mockConfirm).toHaveBeenCalledWith("+12025550123");
    expect(mockSendText).toHaveBeenCalledTimes(1);
    const sent = mockSendText.mock.calls[0][0];
    expect(sent.to).toBe("+12025550123");
    expect(sent.body).toMatch(
      /^Chris & Hannah's wedding sign-in: http:\/\/localhost:3000\/t\/[\w-]{22}\.[0-9a-z]{6}\.[\w-]{22} /,
    );
    expect(mockSend).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain("2025550123");
  });

  it("does not confirm a number that had already opted in", async () => {
    mockRpc.mockImplementation(async (fn: string) =>
      fn === "find_phone_contact"
        ? {
            data: {
              household_id: "5f1c2b8e-1111-4222-8333-944455556666",
              contact_id: "c1",
            },
            error: null,
          }
        : {
            data: { found: true, contact_id: "c1", newly_opted_in: false },
            error: null,
          },
    );
    await POST(request({ identifier: "202-555-0123", sms_consent: true }));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no consent flag", { identifier: "(202) 555-0123" }],
    ["consent false", { identifier: "(202) 555-0123", sms_consent: false }],
    ["a non-US number", { identifier: "(416) 555-0123", sms_consent: true }],
    ["an invalid number", { identifier: "555-0100", sms_consent: true }],
    ["something that is neither", { identifier: "hello", sms_consent: true }],
  ])(
    "sends and records nothing for %s, with the same answer",
    async (_n, body) => {
      const res = await POST(request(body));
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual(NEUTRAL_BOTH);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockSendText).not.toHaveBeenCalled();
      expect(mockConfirm).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "an unknown number",
      () =>
        mockRpc.mockImplementation(async () => ({ data: null, error: null })),
    ],
    [
      "a failed lookup",
      () =>
        mockRpc.mockImplementation(async () => ({
          data: null,
          error: { message: "x" },
        })),
    ],
    ["the limit being reached", () => mockAllow.mockResolvedValue(false)],
    [
      "a refused text",
      () => mockSendText.mockResolvedValue({ ok: false, code: "30006" }),
    ],
    [
      "a thrown error",
      () => mockSendText.mockRejectedValue(new Error("boom +12025550123")),
    ],
  ])("answers the same neutral 202 for %s", async (_n, arrange) => {
    arrange();
    const res = await POST(
      request({ identifier: "(202) 555-0123", sms_consent: true }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL_BOTH);
    expect(loggedText()).not.toContain("2025550123");
  });

  it("records nothing for an unknown number", async () => {
    mockRpc.mockImplementation(async (fn: string) =>
      fn === "find_phone_contact"
        ? { data: null, error: null }
        : { data: { found: true, newly_opted_in: true }, error: null },
    );
    await POST(request({ identifier: "(202) 555-0123", sms_consent: true }));
    expect(mockRpc).not.toHaveBeenCalledWith(
      "record_sms_consent_for_number",
      expect.anything(),
    );
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("checks the limit before any lookup", async () => {
    mockAllow.mockResolvedValue(false);
    await POST(request({ identifier: "(202) 555-0123", sms_consent: true }));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("takes at least the same minimum time", async () => {
    await POST(request({ identifier: "(202) 555-0123", sms_consent: true }));
    expect(mockMinimum).toHaveBeenCalledWith(1500);
  });
});

describe("POST /api/guest/sign-in: when texting is not available", () => {
  it("treats a phone number as unknown: the original email-only answer, nothing called", async () => {
    mockState.mockResolvedValue({
      configured: true,
      enabled: false,
      available: false,
    });
    const res = await POST(
      request({ identifier: "(202) 555-0123", sms_consent: true }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockAllow).not.toHaveBeenCalled();
  });

  it("never mentions mobile numbers in the answer", async () => {
    const res = await POST(request({ email: "guest@example.test" }));
    expect(JSON.stringify(await res.json())).not.toMatch(/mobile|phone|text/i);
  });
});

describe("POST /api/guest/sign-in: the new field name and the old one", () => {
  beforeEach(available);

  it("accepts identifier for an email address and still accepts the old email field", async () => {
    for (const body of [
      { identifier: "Guest@Example.test" },
      { email: "Guest@Example.test" },
    ]) {
      mockSend.mockClear();
      const res = await POST(request(body));
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual(NEUTRAL_BOTH);
      expect(mockSend).toHaveBeenCalledTimes(1);
    }
  });

  it("answers 422 for an identifier with an @ that is not an email address", async () => {
    expect((await POST(request({ identifier: "not@an@email" }))).status).toBe(
      422,
    );
  });
});
