/** @jest-environment node */
import { fakeSupabase } from "@/lib/auth/__tests__/fakes";

jest.mock("server-only", () => ({}), { virtual: true });

const redirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

import { getShellStaff, requireCouplePage, requireStaffPage } from "../session";

const user = { id: "user-1" };

beforeEach(() => redirect.mockClear());

describe("requireStaffPage", () => {
  it("redirects to the admin sign-in page with no session", async () => {
    const { client } = fakeSupabase({ user: null });
    await expect(requireStaffPage(client as never)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/sign-in",
    );
    expect(redirect).toHaveBeenCalledWith("/admin/sign-in");
  });

  it("redirects when the user is neither staff nor guest", async () => {
    const { client } = fakeSupabase({ user });
    await expect(requireStaffPage(client as never)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/sign-in",
    );
  });

  it("returns forbidden, not data, for a guest", async () => {
    const { client } = fakeSupabase({ user, household: true });
    const result = await requireStaffPage(client as never);
    expect(result).toEqual({ forbidden: true });
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(["couple", "planner"] as const)(
    "returns user, role and client for a %s",
    async (role) => {
      const { client } = fakeSupabase({ user, staffRole: role });
      const result = await requireStaffPage(client as never);
      expect(result).toEqual({ user, role, supabase: client });
    },
  );
});

describe("requireCouplePage", () => {
  it("redirects with no session", async () => {
    const { client } = fakeSupabase({ user: null });
    await expect(requireCouplePage(client as never)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/sign-in",
    );
  });

  it("returns forbidden for a planner", async () => {
    const { client } = fakeSupabase({ user, staffRole: "planner" });
    await expect(requireCouplePage(client as never)).resolves.toEqual({
      forbidden: true,
    });
  });

  it("returns forbidden for a guest", async () => {
    const { client } = fakeSupabase({ user, household: true });
    await expect(requireCouplePage(client as never)).resolves.toEqual({
      forbidden: true,
    });
  });

  it("returns the session for a couple member", async () => {
    const { client } = fakeSupabase({ user, staffRole: "couple" });
    await expect(requireCouplePage(client as never)).resolves.toEqual({
      user,
      role: "couple",
      supabase: client,
    });
  });
});

describe("getShellStaff", () => {
  it("returns the display name and role from the staff table", async () => {
    const { client } = fakeSupabase({
      user,
      staffRole: "planner",
      displayName: "Pat Planner",
    });
    await expect(getShellStaff(client as never)).resolves.toEqual({
      displayName: "Pat Planner",
      role: "planner",
    });
  });

  it("is null with no session", async () => {
    const { client } = fakeSupabase({ user: null });
    await expect(getShellStaff(client as never)).resolves.toBeNull();
  });

  it("is null for a guest or a user who is not staff", async () => {
    const { client } = fakeSupabase({ user, household: true });
    await expect(getShellStaff(client as never)).resolves.toBeNull();
  });
});

describe("staff status is never cached", () => {
  it("queries the staff table on every call", async () => {
    const { client, queries } = fakeSupabase({ user, staffRole: "couple" });
    await requireStaffPage(client as never);
    await requireStaffPage(client as never);
    await requireCouplePage(client as never);
    await getShellStaff(client as never);
    await getShellStaff(client as never);
    expect(queries.filter((t) => t === "staff")).toHaveLength(5);
  });
});
