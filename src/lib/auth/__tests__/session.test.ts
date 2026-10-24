/** @jest-environment node */
import { getSession, getSessionKind } from "../session";
import { fakeSupabase } from "./fakes";

const user = { id: "user-1" };

describe("getSessionKind", () => {
  it("is null with no user", async () => {
    const { client } = fakeSupabase({ user: null });
    await expect(getSessionKind(client as never)).resolves.toBeNull();
  });

  it("is null when Supabase reports an auth error", async () => {
    const { client } = fakeSupabase({ user, authError: true, household: true });
    await expect(getSessionKind(client as never)).resolves.toBeNull();
  });

  it("is staff for a staff row", async () => {
    const { client } = fakeSupabase({ user, staffRole: "planner" });
    await expect(getSessionKind(client as never)).resolves.toBe("staff");
  });

  it("is guest for a household responder", async () => {
    const { client } = fakeSupabase({ user, household: true });
    await expect(getSessionKind(client as never)).resolves.toBe("guest");
  });

  it("is staff when the user is both staff and a household responder", async () => {
    const { client } = fakeSupabase({
      user,
      staffRole: "couple",
      household: true,
    });
    await expect(getSessionKind(client as never)).resolves.toBe("staff");
  });

  it("is null for a signed-in user who is neither", async () => {
    const { client } = fakeSupabase({ user });
    await expect(getSessionKind(client as never)).resolves.toBeNull();
  });
});

describe("getSession", () => {
  it("includes the staff role", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    const session = await getSession(client as never);
    expect(session).toMatchObject({ kind: "staff", role: "couple", user });
  });

  it("reads staff status from the table on every call", async () => {
    const { client, queries } = fakeSupabase({ user, staffRole: "couple" });
    await getSession(client as never);
    await getSession(client as never);
    expect(queries.filter((t) => t === "staff")).toHaveLength(2);
  });
});
