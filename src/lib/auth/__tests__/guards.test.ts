/** @jest-environment node */
import {
  AuthError,
  authErrorResponse,
  requireCouple,
  requireGuest,
  requireStaff,
} from "../guards";
import { fakeSupabase } from "./fakes";

const user = { id: "user-1" };

async function thrown(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("requireStaff", () => {
  it("returns the user for staff", async () => {
    const { client } = fakeSupabase({ user, staffRole: "planner" });
    const result = await requireStaff(client as never);
    expect(result.user).toEqual(user);
    expect(result.role).toBe("planner");
  });

  it("throws 401 with no session", async () => {
    const { client } = fakeSupabase({ user: null });
    const e = await thrown(requireStaff(client as never));
    expect(e).toBeInstanceOf(AuthError);
    expect((e as AuthError).status).toBe(401);
  });

  it("throws 403 for a guest", async () => {
    const { client } = fakeSupabase({ user, household: true });
    const e = await thrown(requireStaff(client as never));
    expect((e as AuthError).status).toBe(403);
  });

  it("throws 403 for a signed-in user who is neither", async () => {
    const { client } = fakeSupabase({ user });
    const e = await thrown(requireStaff(client as never));
    expect((e as AuthError).status).toBe(403);
  });

  it("does not cache: revocation applies on the next call", async () => {
    const first = fakeSupabase({ user, staffRole: "planner" });
    await requireStaff(first.client as never);
    const second = fakeSupabase({ user });
    const e = await thrown(requireStaff(second.client as never));
    expect((e as AuthError).status).toBe(403);
  });
});

describe("requireCouple", () => {
  it("allows the couple", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    await expect(requireCouple(client as never)).resolves.toMatchObject({
      role: "couple",
    });
  });

  it("refuses the planner with 403", async () => {
    const { client } = fakeSupabase({ user, staffRole: "planner" });
    const e = await thrown(requireCouple(client as never));
    expect((e as AuthError).status).toBe(403);
  });

  it("refuses no session with 401", async () => {
    const { client } = fakeSupabase({ user: null });
    const e = await thrown(requireCouple(client as never));
    expect((e as AuthError).status).toBe(401);
  });
});

describe("requireGuest", () => {
  it("returns the user for a household responder", async () => {
    const { client } = fakeSupabase({ user, household: true });
    const result = await requireGuest(client as never);
    expect(result.user).toEqual(user);
  });

  it("throws 401 with no session", async () => {
    const { client } = fakeSupabase({ user: null });
    const e = await thrown(requireGuest(client as never));
    expect((e as AuthError).status).toBe(401);
  });

  it("treats a user who is both staff and responder as staff, so 403", async () => {
    const { client } = fakeSupabase({
      user,
      staffRole: "planner",
      household: true,
    });
    const e = await thrown(requireGuest(client as never));
    expect((e as AuthError).status).toBe(403);
  });

  it("throws 403 for a signed-in user with no household", async () => {
    const { client } = fakeSupabase({ user });
    const e = await thrown(requireGuest(client as never));
    expect((e as AuthError).status).toBe(403);
  });
});

describe("authErrorResponse", () => {
  it("maps an AuthError to the shared error shape", async () => {
    const response = authErrorResponse(new AuthError(403, "forbidden"));
    expect(response?.status).toBe(403);
    const body = await response?.json();
    expect(body.error.code).toBe("forbidden");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns null for other errors so handlers rethrow", () => {
    expect(authErrorResponse(new Error("x"))).toBeNull();
  });
});
