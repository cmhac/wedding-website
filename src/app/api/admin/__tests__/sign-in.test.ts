/**
 * @jest-environment node
 *
 * Pattern for testing route handlers in this repo: the `@jest-environment node`
 * docblock above gives the test the Web `Request`/`Response` globals that
 * route handlers use (the default jsdom environment does not). Import the
 * handler, build a `Request`, call the exported function directly, and mock
 * the Supabase helpers with `jest.mock`.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
const mockSignInWithOtp = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { signInWithOtp: mockSignInWithOtp },
  }),
}));
jest.mock("@/lib/rate-limit", () => ({
  ...jest.requireActual("@/lib/rate-limit"),
  createRateLimiter: () => ({ check: (k: string) => mockLimiter(k) }),
}));
const mockLimiter = jest.fn((_key: string) => true);
const mockMinimum = jest.fn();
jest.mock("@/lib/sign-in-timing", () => ({
  withMinimumDuration: async (ms: number, work: () => Promise<unknown>) => {
    mockMinimum(ms);
    await work().catch(() => {});
  },
}));

import { POST } from "../sign-in/route";

const NEUTRAL = {
  message: "If that address belongs to a staff account, a link is on its way.",
};

function request(body: unknown, raw = false) {
  return new Request("http://localhost:3000/api/admin/sign-in", {
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

describe("POST /api/admin/sign-in", () => {
  it("asks Supabase for a staff-audience link without creating users", async () => {
    await POST(request({ email: "planner@example.com" }));
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "planner@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "http://localhost:3000/auth/callback?audience=staff",
      },
    });
  });

  it("answers 202 with the neutral message for a known address", async () => {
    const res = await POST(request({ email: "planner@example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
  });

  it("answers identically when Supabase says the user does not exist", async () => {
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

  it("answers 422 for a malformed email", async () => {
    const res = await POST(request({ email: "not-an-email" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.issues).toBeDefined();
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("answers 422 for a missing body or invalid JSON", async () => {
    expect((await POST(request("{nope", true))).status).toBe(422);
    expect((await POST(request({}))).status).toBe(422);
  });

  it("answers 429 when rate limited, without calling Supabase", async () => {
    mockLimiter.mockReturnValue(false);
    const res = await POST(request({ email: "planner@example.com" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("limits by the trusted client address, not the leftmost forwarded hop", async () => {
    await POST(request({ email: "planner@example.com" }));
    const keys = mockLimiter.mock.calls.map((c) => c[0]);
    expect(keys).toContain("1.2.3.4");
    expect(keys).not.toContain("6.6.6.6");
  });

  it("limits per email address (lower-cased) and still answers the neutral 202 without calling Supabase", async () => {
    mockLimiter.mockImplementation((k) => k !== "planner@example.com");
    const res = await POST(request({ email: "Planner@Example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(NEUTRAL);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("takes a fixed minimum time so the response time does not reveal whether the address is known", async () => {
    await POST(request({ email: "planner@example.com" }));
    expect(mockMinimum.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
  });

  it("never echoes the email address back", async () => {
    const res = await POST(request({ email: "planner@example.com" }));
    expect(JSON.stringify(await res.json())).not.toContain(
      "planner@example.com",
    );
  });
});
