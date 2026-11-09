/** @jest-environment node */
const mockVerify = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp: mockVerify } }),
}));
const mockGetSession = jest.fn();
jest.mock("@/lib/auth/session", () => ({
  getSession: () => mockGetSession(),
}));

import { GET, POST } from "../route";

const get = (query: string) =>
  GET(new Request(`http://localhost:3000/auth/confirm?${query}`));
const post = (fields: Record<string, string>) =>
  POST(
    new Request("http://localhost:3000/auth/confirm", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    }),
  );
const to = (res: Response) => new URL(res.headers.get("location")!).pathname;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.GUEST_RSVP_PATH;
  mockVerify.mockResolvedValue({ data: { session: {} }, error: null });
  mockGetSession.mockResolvedValue({ kind: "guest" });
});

describe.each([
  [
    "GET",
    (q: Record<string, string>) => get(new URLSearchParams(q).toString()),
  ],
  ["POST", post],
] as const)("%s /auth/confirm", (_name, call) => {
  it("exchanges the token and sends a guest to the RSVP, uncached", async () => {
    const res = await call({ token_hash: "th", type: "email" });
    expect(mockVerify).toHaveBeenCalledWith({
      token_hash: "th",
      type: "email",
    });
    expect(res.status).toBe(302);
    expect(to(res)).toBe("/rsvp");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sends a staff account to /admin", async () => {
    mockGetSession.mockResolvedValue({ kind: "staff" });
    expect(to(await call({ token_hash: "th", type: "email" }))).toBe("/admin");
  });

  it("honours a relative next under the allowed paths, and ignores anything else", async () => {
    expect(
      to(await call({ token_hash: "th", type: "email", next: "/rsvp/meals" })),
    ).toBe("/rsvp/meals");
    expect(
      to(await call({ token_hash: "th", type: "email", next: "/admin" })),
    ).toBe("/rsvp");
    expect(
      to(
        await call({ token_hash: "th", type: "email", next: "//evil.example" }),
      ),
    ).toBe("/rsvp");
  });

  it.each([
    ["a missing token", { type: "email" }],
    ["a missing type", { token_hash: "th" }],
    ["a type other than email", { token_hash: "th", type: "recovery" }],
  ])(
    "sends %s to the failure path without calling Supabase",
    async (_n, fields) => {
      const res = await call(fields);
      expect(to(res)).toBe("/auth/error");
      expect(mockVerify).not.toHaveBeenCalled();
    },
  );

  it("sends a Supabase error to the failure path with no detail", async () => {
    mockVerify.mockResolvedValue({ data: {}, error: { message: "expired" } });
    const res = await call({ token_hash: "th", type: "email" });
    expect(to(res)).toBe("/auth/error");
    expect(new URL(res.headers.get("location")!).search).toBe("");
  });

  it("sends a missing session, or a thrown error, to the failure path", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(to(await call({ token_hash: "th", type: "email" }))).toBe(
      "/auth/error",
    );
    mockVerify.mockRejectedValue(new Error("boom"));
    expect(to(await call({ token_hash: "th", type: "email" }))).toBe(
      "/auth/error",
    );
  });
});
