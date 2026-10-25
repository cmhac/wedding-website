/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });

const redirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

const signOutMock = jest.fn();
const createServerSupabase = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => createServerSupabase(),
}));

import { signOut } from "../session";

beforeEach(() => {
  redirect.mockClear();
  signOutMock.mockReset();
  signOutMock.mockResolvedValue({ error: null });
  createServerSupabase.mockReset();
  createServerSupabase.mockResolvedValue({ auth: { signOut: signOutMock } });
});

describe("signOut", () => {
  it("signs out on the server client and redirects to the admin sign-in page", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/admin/sign-in");
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/admin/sign-in");
  });

  it("still redirects when there is no session", async () => {
    signOutMock.mockResolvedValue({
      error: { message: "Auth session missing" },
    });
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/admin/sign-in");
  });

  it("still redirects when signing out throws", async () => {
    signOutMock.mockRejectedValue(new Error("network"));
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/admin/sign-in");
  });
});
