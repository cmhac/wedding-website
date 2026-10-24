/** @jest-environment node */
const mockSignInWithOtp = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { signInWithOtp: mockSignInWithOtp },
  }),
}));
const mockLimiter = jest.fn((_key: string) => true); // eslint-disable-line @typescript-eslint/no-unused-vars
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

beforeEach(() => {
  jest.clearAllMocks();
  mockLimiter.mockReturnValue(true);
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
});

describe("POST /api/guest/sign-in", () => {
  it("asks for a link without creating users", async () => {
    await POST(request({ email: "guest@example.com" }));
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "guest@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "http://localhost:3000/auth/callback",
      },
    });
  });

  it("answers 202 with the neutral message for a known address", async () => {
    const res = await POST(request({ email: "guest@example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
  });

  it("answers identically for an unknown address (Supabase error)", async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: {
        code: "otp_disabled",
        status: 422,
        message: "Signups not allowed",
      },
    });
    const res = await POST(request({ email: "nobody@example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
  });

  it("answers identically when Supabase throws", async () => {
    mockSignInWithOtp.mockRejectedValue(new Error("network"));
    const res = await POST(request({ email: "x@example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
  });

  it("logs only an outcome code, never the address", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "otp_disabled", message: "x@example.com not allowed" },
    });
    await POST(request({ email: "x@example.com" }));
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("otp_disabled");
    expect(logged).not.toContain("example.com");
    warn.mockRestore();
  });

  it("answers 422 for a malformed email, missing body, or invalid JSON", async () => {
    const res = await POST(request({ email: "not-an-email" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.issues).toBeDefined();
    expect((await POST(request("{nope", true))).status).toBe(422);
    expect((await POST(request({}))).status).toBe(422);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("answers 429 when rate limited, without calling Supabase", async () => {
    mockLimiter.mockReturnValue(false);
    const res = await POST(request({ email: "guest@example.com" }));
    expect(res.status).toBe(429);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("limits by the trusted client address, not the leftmost forwarded hop", async () => {
    await POST(request({ email: "guest@example.com" }));
    const keys = mockLimiter.mock.calls.map((c) => c[0]);
    expect(keys).toContain("1.2.3.4");
    expect(keys).not.toContain("6.6.6.6");
  });

  it("limits per email address (lower-cased) and still answers the neutral 202 without calling Supabase", async () => {
    mockLimiter.mockImplementation((k) => k !== "guest@example.com");
    const res = await POST(request({ email: "Guest@Example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("takes a fixed minimum time so the response time does not reveal whether the address is known", async () => {
    await POST(request({ email: "guest@example.com" }));
    expect(mockMinimum).toHaveBeenCalledWith(expect.any(Number));
    expect(mockMinimum.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
  });

  it("never echoes the email address back", async () => {
    const res = await POST(request({ email: "guest@example.com" }));
    expect(JSON.stringify(await res.json())).not.toContain("guest@example.com");
  });
});
