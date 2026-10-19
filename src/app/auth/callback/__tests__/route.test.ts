/** @jest-environment node */
const mockExchange = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { exchangeCodeForSession: mockExchange },
  }),
}));
const mockGetSession = jest.fn();
jest.mock("@/lib/auth/session", () => ({
  getSession: () => mockGetSession(),
}));

import { GET } from "../route";

const get = (query: string) =>
  GET(new Request(`http://localhost:3000/auth/callback?${query}`));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.GUEST_RSVP_PATH;
  mockExchange.mockResolvedValue({ error: null });
});

describe("GET /auth/callback", () => {
  it("sends staff to /admin when the link carries the staff audience marker", async () => {
    mockGetSession.mockResolvedValue({ kind: "staff" });
    const res = await get("audience=staff&code=abc");
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin");
    expect(mockExchange).toHaveBeenCalledWith("abc");
  });

  it("sends guests to the RSVP path, whatever the audience marker says", async () => {
    mockGetSession.mockResolvedValue({ kind: "guest" });
    const res = await get("audience=staff&code=abc");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/rsvp");
  });

  it("sends a missing code or a failed exchange to the failure path", async () => {
    expect(
      new URL((await get("audience=staff")).headers.get("location")!).pathname,
    ).toBe("/auth/error");
    mockExchange.mockResolvedValue({ error: { message: "bad" } });
    expect(
      new URL((await get("code=x")).headers.get("location")!).pathname,
    ).toBe("/auth/error");
  });
});
