/** @jest-environment node */
const mockSignOut = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { signOut: mockSignOut } }),
}));

import { POST } from "../route";

describe("POST /api/guest/sign-out", () => {
  beforeEach(() => mockSignOut.mockReset());

  it("ends the session and answers 204", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    const res = await POST();
    expect(mockSignOut).toHaveBeenCalled();
    expect(res.status).toBe(204);
  });

  it("answers 204 even when signing out throws", async () => {
    mockSignOut.mockRejectedValue(new Error("down"));
    expect((await POST()).status).toBe(204);
  });
});
