/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
jest.mock("@/lib/log");
jest.mock("server-only", () => ({}), { virtual: true });

const maybeSingle = jest.fn();
const getUserById = jest.fn();
const generateLink = jest.fn();
const verifyOtp = jest.fn();

const eq = jest.fn((_c: string, _v: string) => ({ maybeSingle }));
const select = jest.fn((_cols: string) => ({ eq }));
const from = jest.fn((_t: string) => ({ select }));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from,
    auth: { admin: { getUserById, generateLink } },
  }),
}));
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp } }),
}));

import { createHouseholdSession } from "../household-session";

beforeEach(() => {
  jest.clearAllMocks();
  maybeSingle.mockResolvedValue({
    data: { auth_user_id: "user-1" },
    error: null,
  });
  getUserById.mockResolvedValue({
    data: { user: { id: "user-1", email: "household-h1@households.invalid" } },
    error: null,
  });
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "hash-1" } },
    error: null,
  });
  verifyOtp.mockResolvedValue({
    data: { session: { access_token: "a" } },
    error: null,
  });
});

describe("createHouseholdSession", () => {
  it("looks up the household's Auth user, asks for a link, and exchanges it for a session", async () => {
    const res = await createHouseholdSession("h1");
    expect(res).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("households");
    expect(eq).toHaveBeenCalledWith("id", "h1");
    expect(getUserById).toHaveBeenCalledWith("user-1");
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "household-h1@households.invalid",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-1",
      type: "email",
    });
  });

  it("fails without detail for a missing household", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await createHouseholdSession("nope")).toEqual({ ok: false });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("fails for a household with no Auth user", async () => {
    maybeSingle.mockResolvedValue({
      data: { auth_user_id: null },
      error: null,
    });
    expect(await createHouseholdSession("h1")).toEqual({ ok: false });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the household lookup",
      () =>
        maybeSingle.mockResolvedValue({
          data: null,
          error: { message: "x@y.z" },
        }),
    ],
    [
      "the user lookup",
      () =>
        getUserById.mockResolvedValue({
          data: { user: null },
          error: { message: "x" },
        }),
    ],
    [
      "generateLink",
      () =>
        generateLink.mockResolvedValue({ data: null, error: { message: "x" } }),
    ],
    [
      "a missing token",
      () =>
        generateLink.mockResolvedValue({
          data: { properties: {} },
          error: null,
        }),
    ],
    [
      "verifyOtp",
      () =>
        verifyOtp.mockResolvedValue({
          data: { session: null },
          error: { message: "x" },
        }),
    ],
  ])("fails with no detail when %s fails", async (_name, arrange) => {
    arrange();
    const res = await createHouseholdSession("h1");
    expect(res).toEqual({ ok: false });
  });

  it("fails with no detail when something throws", async () => {
    generateLink.mockRejectedValue(new Error("network leak@example.com"));
    const res = await createHouseholdSession("h1");
    expect(res).toEqual({ ok: false });
    expect(JSON.stringify(res)).not.toContain("leak");
  });
});
