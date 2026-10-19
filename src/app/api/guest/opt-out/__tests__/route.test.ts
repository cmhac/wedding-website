/** @jest-environment node */
import { AuthError } from "@/lib/auth/guards";

const mockRpc = jest.fn();
const mockRequireGuest = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireGuest: () => mockRequireGuest(),
}));

import { POST } from "../route";

function post(body: unknown, raw = false) {
  return new Request("http://localhost:3000/api/guest/opt-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireGuest.mockResolvedValue({ supabase: { rpc: mockRpc } });
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe("POST /api/guest/opt-out", () => {
  it("answers 401 without a guest session", async () => {
    mockRequireGuest.mockRejectedValue(new AuthError(401, "unauthenticated"));
    expect((await POST(post({ opt_out: true }))).status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 403 for a staff session", async () => {
    mockRequireGuest.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await POST(post({ opt_out: true }))).status).toBe(403);
  });

  it("answers 422 for a non-boolean or missing value", async () => {
    expect((await POST(post({ opt_out: "yes" }))).status).toBe(422);
    expect((await POST(post({}))).status).toBe(422);
    expect((await POST(post("{nope", true))).status).toBe(422);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "saves %s and returns the new value",
    async (value) => {
      const res = await POST(post({ opt_out: value }));
      expect(mockRpc).toHaveBeenCalledWith("set_reminders_opt_out", {
        opt_out: value,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ opt_out: value });
    },
  );

  it("answers 403 when the database says not_a_guest", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "not_a_guest" },
    });
    expect((await POST(post({ opt_out: true }))).status).toBe(403);
  });
});
