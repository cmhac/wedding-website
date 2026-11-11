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
import { log } from "@/lib/log";
import { inviteToken } from "@/lib/auth/invite-link";
import { GET } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const SECRET = "test-invite-secret-long-enough-for-hmac-0123456789";

const open = (token: string, query = "") =>
  GET(new Request(`http://localhost:3000/i/${token}${query}`), {
    params: Promise.resolve({ token }),
  });
const to = (res: Response) => new URL(res.headers.get("location")!).pathname;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INVITE_LINK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.GUEST_RSVP_PATH;
  maybeSingle.mockResolvedValue({
    data: { auth_user_id: "user-1", invite_link_version: 2 },
    error: null,
  });
  rpc.mockResolvedValue({ data: true, error: null });
  mockCreateSession.mockResolvedValue({ ok: true });
});

describe("GET /i/[token]", () => {
  it("signs the household in and redirects to the home page, uncached and unindexed", async () => {
    const res = await open(inviteToken(ID, 2));
    expect(res.status).toBe(302);
    expect(to(res)).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(mockCreateSession).toHaveBeenCalledWith(ID);
    expect(eq).toHaveBeenCalledWith("id", ID);
    expect(rpc).toHaveBeenCalledWith("invite_links_open");
  });

  it("lands on the save the date page when the link asks for it, and ignores any other landing", async () => {
    expect(to(await open(inviteToken(ID, 2), "?next=/save-the-date"))).toBe(
      "/save-the-date",
    );
    expect(to(await open(inviteToken(ID, 2), "?next=/admin"))).toBe("/");
    expect(to(await open(inviteToken(ID, 2), "?next=//evil.example"))).toBe(
      "/",
    );
  });

  it("follows GUEST_RSVP_PATH", async () => {
    process.env.GUEST_RSVP_PATH = "/reply";
    expect(to(await open(inviteToken(ID, 2)))).toBe("/reply");
  });

  it("honours a relative next under the RSVP path and ignores anything else", async () => {
    process.env.GUEST_RSVP_PATH = "/rsvp";
    const token = inviteToken(ID, 2);
    expect(to(await open(token, "?next=/rsvp/meals"))).toBe("/rsvp/meals");
    expect(to(await open(token, "?next=/admin"))).toBe("/rsvp");
    expect(to(await open(token, "?next=//evil.example"))).toBe("/rsvp");
    expect(to(await open(token, "?next=https://evil.example"))).toBe("/rsvp");
  });

  it("opens twice with two independent sessions, using up nothing", async () => {
    const token = inviteToken(ID, 2);
    expect(to(await open(token))).toBe("/");
    expect(to(await open(token))).toBe("/");
    expect(mockCreateSession).toHaveBeenCalledTimes(2);
  });

  describe.each([
    ["a malformed token", () => "not-a-token", () => {}],
    [
      "a wrong signature",
      () => `${inviteToken(ID, 2).split(".")[0]}.${"A".repeat(43)}`,
      () => {},
    ],
    ["a superseded version", () => inviteToken(ID, 1), () => {}],
    [
      "an unknown household",
      () => inviteToken(ID, 2),
      () => maybeSingle.mockResolvedValue({ data: null, error: null }),
    ],
    [
      "a household with no sign-in account",
      () => inviteToken(ID, 2),
      () =>
        maybeSingle.mockResolvedValue({
          data: { auth_user_id: null, invite_link_version: 2 },
          error: null,
        }),
    ],
    [
      "a failed household lookup",
      () => inviteToken(ID, 2),
      () =>
        maybeSingle.mockResolvedValue({ data: null, error: { message: "x" } }),
    ],
    [
      "links closed for the wedding day",
      () => inviteToken(ID, 2),
      () => rpc.mockResolvedValue({ data: false, error: null }),
    ],
    [
      "a failed links-open check",
      () => inviteToken(ID, 2),
      () => rpc.mockResolvedValue({ data: null, error: { message: "x" } }),
    ],
    [
      "a failing session",
      () => inviteToken(ID, 2),
      () => mockCreateSession.mockResolvedValue({ ok: false }),
    ],
    [
      "a thrown error",
      () => inviteToken(ID, 2),
      () =>
        mockCreateSession.mockRejectedValue(
          new Error("boom leak@example.test"),
        ),
    ],
  ])("%s", (_name, token, arrange) => {
    it("redirects to /auth/error with no detail, and the same headers as success", async () => {
      arrange();
      const res = await open(token());
      expect(res.status).toBe(302);
      expect(to(res)).toBe("/auth/error");
      expect(new URL(res.headers.get("location")!).search).toBe("");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    });
  });

  it("does not look at the database for a malformed token or start a session for a bad one", async () => {
    await open("not-a-token");
    expect(from).not.toHaveBeenCalled();
    await open(inviteToken(ID, 1));
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("logs nothing but an outcome code", async () => {
    await open(inviteToken(ID, 2));
    await open(inviteToken(ID, 1));
    const calls = [
      ...(log.info as jest.Mock).mock.calls,
      ...(log.warn as jest.Mock).mock.calls,
      ...(log.error as jest.Mock).mock.calls,
    ];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, fields] of calls) {
      expect(Object.keys(fields ?? {})).toEqual(["outcome"]);
    }
    const text = JSON.stringify(calls);
    expect(text).not.toContain(ID);
    expect(text).not.toContain(inviteToken(ID, 2));
  });
});
