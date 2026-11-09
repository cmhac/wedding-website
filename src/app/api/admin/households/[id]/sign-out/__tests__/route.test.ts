/** @jest-environment node */
jest.mock("@/lib/log");
jest.mock("server-only", () => ({}), { virtual: true });
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
const rpc = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ rpc }),
}));

import { AuthError } from "@/lib/auth/guards";
import { POST } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const post = (id = ID) =>
  POST(
    new Request(`http://localhost:3000/api/admin/households/${id}/sign-out`, {
      method: "POST",
    }),
    {
      params: Promise.resolve({ id }),
    },
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({ kind: "staff", role: "planner" });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("POST /api/admin/households/[id]/sign-out", () => {
  it.each([
    [401, new AuthError(401, "unauthenticated")],
    [403, new AuthError(403, "forbidden")],
  ])(
    "answers %i when the guard refuses, revoking nothing",
    async (status, err) => {
      mockRequireStaff.mockRejectedValueOnce(err);
      expect((await post()).status).toBe(status);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("revokes the household's sessions with the service role and answers 204", async () => {
    const res = await post();
    expect(res.status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("revoke_household_sessions", {
      household_id: ID,
    });
  });

  it("answers 404 for an unknown or malformed household", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_found" } });
    expect((await post()).status).toBe(404);
    rpc.mockClear();
    expect((await post("not-a-uuid")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 500 on any other failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await post()).status).toBe(500);
  });
});
