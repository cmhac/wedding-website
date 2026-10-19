/** @jest-environment node */
const mockSignOut = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { signOut: mockSignOut } }),
}));

import { POST } from "../sign-out/route";

describe("POST /api/admin/sign-out", () => {
  beforeEach(() => mockSignOut.mockReset());

  it("ends the session and answers 204", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    const res = await POST();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("answers 204 even if Supabase fails", async () => {
    mockSignOut.mockRejectedValue(new Error("down"));
    const res = await POST();
    expect(res.status).toBe(204);
  });
});
