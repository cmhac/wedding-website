/** @jest-environment node */
const mockExchange = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { exchangeCodeForSession: mockExchange },
  }),
}));
const mockGetSession = jest.fn();
jest.mock("@/lib/auth/session", () => ({
  getSession: (...a: unknown[]) => mockGetSession(...a),
}));

import { GET } from "../callback/route";

const SITE = "http://localhost:3000";

function call(query: string) {
  return GET(new Request(`${SITE}/auth/callback${query}`));
}
function location(res: Response) {
  return res.headers.get("location");
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  delete process.env.GUEST_RSVP_PATH;
  mockExchange.mockResolvedValue({ error: null });
  mockGetSession.mockResolvedValue({ kind: "staff" });
});

describe("GET /auth/callback", () => {
  it("exchanges the code and sends staff to /admin with a 302", async () => {
    const res = await call("?code=abc");
    expect(mockExchange).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(302);
    expect(location(res)).toBe(`${SITE}/admin`);
  });

  it("sends guests to /rsvp", async () => {
    mockGetSession.mockResolvedValue({ kind: "guest" });
    expect(location(await call("?code=abc"))).toBe(`${SITE}/rsvp`);
  });

  it("uses GUEST_RSVP_PATH for guests when set", async () => {
    process.env.GUEST_RSVP_PATH = "/reply";
    mockGetSession.mockResolvedValue({ kind: "guest" });
    expect(location(await call("?code=abc"))).toBe(`${SITE}/reply`);
  });

  it("redirects to the failure path when the code is missing", async () => {
    const res = await call("");
    expect(res.status).toBe(302);
    expect(location(res)).toBe(`${SITE}/auth/error`);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("redirects to the failure path when the exchange fails", async () => {
    mockExchange.mockResolvedValue({ error: { message: "expired" } });
    expect(location(await call("?code=abc"))).toBe(`${SITE}/auth/error`);
  });

  it("redirects to the failure path when the exchange throws", async () => {
    mockExchange.mockRejectedValue(new Error("down"));
    expect(location(await call("?code=abc"))).toBe(`${SITE}/auth/error`);
  });

  it("redirects to the failure path for a user who is neither staff nor guest", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(location(await call("?code=abc"))).toBe(`${SITE}/auth/error`);
  });

  describe("next parameter", () => {
    it("honors an allowlisted path for staff", async () => {
      expect(location(await call("?code=abc&next=/admin/guests"))).toBe(
        `${SITE}/admin/guests`,
      );
    });

    it("honors an allowlisted path for guests", async () => {
      mockGetSession.mockResolvedValue({ kind: "guest" });
      expect(location(await call("?code=abc&next=/rsvp/meals"))).toBe(
        `${SITE}/rsvp/meals`,
      );
    });

    it("does not send guests into /admin", async () => {
      mockGetSession.mockResolvedValue({ kind: "guest" });
      expect(location(await call("?code=abc&next=/admin"))).toBe(
        `${SITE}/rsvp`,
      );
    });

    it.each([
      "https://evil.example/admin",
      "//evil.example",
      "/\\evil.example",
      "/admin/../etc",
      "/adminx",
      "/other",
      "admin",
      "javascript:alert(1)",
      "/admin%2f%2fevil",
      "",
    ])("ignores %p and uses the default", async (next) => {
      const res = await call(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(location(res)).toBe(`${SITE}/admin`);
    });
  });

  it("never redirects off the site origin", async () => {
    const res = await call("?code=abc&next=https://evil.example");
    expect(new URL(location(res)!).origin).toBe(SITE);
  });
});
