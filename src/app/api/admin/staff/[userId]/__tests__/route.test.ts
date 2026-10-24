/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireCouple = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireCouple: () => mockRequireCouple(),
}));
const select = jest.fn();
const chain: Record<string, unknown> = { select };
chain.delete = jest.fn(() => chain);
chain.eq = jest.fn(() => chain);
const adminClient = { from: jest.fn(() => chain) };
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => adminClient,
}));

import { AuthError } from "@/lib/auth/guards";
import { DELETE } from "../route";

const USER = "5f1c2b8e-1111-4222-8333-944455556666";
const del = (id = USER) =>
  DELETE(
    new Request(`http://localhost:3000/api/admin/staff/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ userId: id }) },
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireCouple.mockResolvedValue({ kind: "staff", role: "couple" });
  select.mockResolvedValue({ data: [{ user_id: USER }], error: null });
});

describe("DELETE /api/admin/staff/[userId]", () => {
  it.each([
    [401, new AuthError(401, "unauthenticated")],
    [403, new AuthError(403, "forbidden")],
  ])(
    "answers %i when the guard refuses (anon, guest, or planner)",
    async (status, err) => {
      mockRequireCouple.mockRejectedValueOnce(err);
      expect((await del()).status).toBe(status);
      expect(adminClient.from).not.toHaveBeenCalled();
    },
  );

  it("deletes the staff row and answers 204", async () => {
    const res = await del();
    expect(res.status).toBe(204);
    expect(adminClient.from).toHaveBeenCalledWith("staff");
    expect(chain.eq as jest.Mock).toHaveBeenCalledWith("user_id", USER);
  });

  it("answers 404 for an unknown or malformed id", async () => {
    select.mockResolvedValue({ data: [], error: null });
    expect((await del()).status).toBe(404);
    expect((await del("not-a-uuid")).status).toBe(404);
  });

  it("answers 409 last_couple when the database refuses the removal", async () => {
    select.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "cannot remove or demote the last couple account",
      },
    });
    const res = await del();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("last_couple");
  });

  it("answers 500 for other database errors", async () => {
    select.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await del()).status).toBe(500);
  });
});
