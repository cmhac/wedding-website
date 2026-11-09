/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
jest.mock("@/lib/log");
jest.mock("server-only", () => ({}), { virtual: true });
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));

const single = jest.fn();
const rpc = jest.fn((fn: string, _args?: object): unknown => {
  if (fn === "staff_households") return { eq: () => ({ single }) };
  return Promise.resolve(reissueReply);
});
let reissueReply: { data: unknown; error: unknown } = { data: 2, error: null };
const staffClient = { rpc };

import { AuthError } from "@/lib/auth/guards";
import { inviteToken, parseInviteToken } from "@/lib/auth/invite-link";
import { GET, POST } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const ISSUED = "2027-01-01T00:00:00+00:00";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const url = (id = ID) =>
  `http://localhost:3000/api/admin/households/${id}/invite-link`;
const get = (id = ID) => GET(new Request(url(id)), ctx(id));
const post = (id = ID) =>
  POST(new Request(url(id), { method: "POST" }), ctx(id));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INVITE_LINK_SECRET =
    "test-invite-secret-long-enough-for-hmac-0123456789";
  process.env.NEXT_PUBLIC_SITE_URL = "https://wedding.example";
  reissueReply = { data: 2, error: null };
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "planner",
    supabase: staffClient,
  });
  single.mockResolvedValue({
    data: { id: ID, invite_link_version: 1, invite_link_issued_at: ISSUED },
    error: null,
  });
});

describe.each([
  ["GET", get],
  ["POST", post],
] as const)("%s /api/admin/households/[id]/invite-link access", (_n, call) => {
  it.each([
    [401, new AuthError(401, "unauthenticated")],
    [403, new AuthError(403, "forbidden")],
  ])("answers %i when the guard refuses", async (status, err) => {
    mockRequireStaff.mockRejectedValueOnce(err);
    expect((await call()).status).toBe(status);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed id", async () => {
    expect((await call("not-a-uuid")).status).toBe(404);
  });
});

describe("GET /api/admin/households/[id]/invite-link", () => {
  it("returns the current link and when it was issued, never cached", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json.issued_at).toBe(ISSUED);
    expect(json.url).toBe(`https://wedding.example/i/${inviteToken(ID, 1)}`);
    expect(parseInviteToken(json.url.split("/i/")[1], 1)).toEqual({
      householdId: ID,
    });
  });

  it("answers 404 when the household does not exist", async () => {
    single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    expect((await get()).status).toBe(404);
  });

  it("answers 500 on any other read failure", async () => {
    single.mockResolvedValue({ data: null, error: { code: "XX000" } });
    expect((await get()).status).toBe(500);
  });
});

describe("POST /api/admin/households/[id]/invite-link", () => {
  it("reissues, then returns the new link; the old token no longer passes the version check", async () => {
    single.mockResolvedValue({
      data: { id: ID, invite_link_version: 2, invite_link_issued_at: ISSUED },
      error: null,
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(rpc).toHaveBeenCalledWith("reissue_invite_link", {
      household_id: ID,
    });
    const json = await res.json();
    expect(json.url).toBe(`https://wedding.example/i/${inviteToken(ID, 2)}`);
    const oldToken = inviteToken(ID, 1);
    expect(parseInviteToken(oldToken, 2)).toBeNull();
    expect(parseInviteToken(json.url.split("/i/")[1], 2)).toEqual({
      householdId: ID,
    });
  });

  it("answers 404 for an unknown household", async () => {
    reissueReply = { data: null, error: { message: "not_found" } };
    expect((await post()).status).toBe(404);
  });

  it("answers 403 when the database says forbidden", async () => {
    reissueReply = { data: null, error: { message: "forbidden" } };
    expect((await post()).status).toBe(403);
  });

  it("answers 500 on any other failure", async () => {
    reissueReply = { data: null, error: { message: "boom" } };
    expect((await post()).status).toBe(500);
  });
});
