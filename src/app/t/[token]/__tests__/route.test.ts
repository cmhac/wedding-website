/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
jest.mock("@/lib/log");
jest.mock("server-only", () => ({}), { virtual: true });

const maybeSingle = jest.fn();
const rpc = jest.fn();
const eq = jest.fn((_c: string, _v: string) => ({ maybeSingle }));
const select = jest.fn((_cols: string) => ({ eq }));
const from = jest.fn((_t: string) => ({ select }));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ from, rpc }),
}));
const mockCreateSession = jest.fn();
jest.mock("@/lib/auth/household-session", () => ({
  createHouseholdSession: (...a: unknown[]) => mockCreateSession(...a),
}));
import { timedToken } from "@/lib/auth/timed-link";
import { GET } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";

const open = (token: string, query = "") =>
  GET(new Request(`http://localhost:3000/t/${token}${query}`), {
    params: Promise.resolve({ token }),
  });
const to = (res: Response) => new URL(res.headers.get("location")!).pathname;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INVITE_LINK_SECRET =
    "test-invite-secret-long-enough-for-hmac-0123456789";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.GUEST_RSVP_PATH;
  maybeSingle.mockResolvedValue({
    data: { auth_user_id: "user-1", invite_link_version: 2 },
    error: null,
  });
  mockCreateSession.mockResolvedValue({ ok: true });
});

describe("GET /t/[token]", () => {
  it("signs the household in and redirects home, uncached and unindexed", async () => {
    const res = await open(timedToken(ID, 2));
    expect(res.status).toBe(302);
    expect(to(res)).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(mockCreateSession).toHaveBeenCalledWith(ID);
  });

  it("can be opened twice in its window, as a link preview may open it first", async () => {
    const token = timedToken(ID, 2);
    expect(to(await open(token))).toBe("/");
    expect(to(await open(token))).toBe("/");
    expect(mockCreateSession).toHaveBeenCalledTimes(2);
  });

  it("does not depend on the wedding-day cutoff", async () => {
    await open(timedToken(ID, 2));
    expect(rpc).not.toHaveBeenCalled();
  });

  describe.each([
    ["a malformed token", () => "nope", () => {}],
    [
      "an expired token",
      () => timedToken(ID, 2, new Date(Date.now() - 20 * 60_000)),
      () => {},
    ],
    ["a superseded link version", () => timedToken(ID, 1), () => {}],
    [
      "an unknown household",
      () => timedToken(ID, 2),
      () => maybeSingle.mockResolvedValue({ data: null, error: null }),
    ],
    [
      "a household with no sign-in account",
      () => timedToken(ID, 2),
      () =>
        maybeSingle.mockResolvedValue({
          data: { auth_user_id: null, invite_link_version: 2 },
          error: null,
        }),
    ],
    [
      "a failed session",
      () => timedToken(ID, 2),
      () => mockCreateSession.mockResolvedValue({ ok: false }),
    ],
  ])("%s", (_n, makeToken, arrange) => {
    it("is the one plain failure redirect with no detail", async () => {
      arrange();
      const res = await open(makeToken());
      expect(res.status).toBe(302);
      expect(to(res)).toBe("/auth/error");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    });
  });
});
