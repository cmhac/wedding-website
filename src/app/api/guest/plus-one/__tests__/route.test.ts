/** @jest-environment node */
import { AuthError } from "@/lib/auth/guards";

const mockRpc = jest.fn();
const mockRequireGuest = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireGuest: () => mockRequireGuest(),
}));

import { POST } from "../route";

const GUEST = "11111111-1111-4111-8111-111111111111";
const BODY = { guest_id: GUEST, first_name: "Sam", last_name: "Fake" };
const UPDATED = {
  id: GUEST,
  first_name: "Sam",
  last_name: "Fake",
  is_placeholder: false,
};

function post(body: unknown, raw = false) {
  return new Request("http://localhost:3000/api/guest/plus-one", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireGuest.mockResolvedValue({ supabase: { rpc: mockRpc } });
  mockRpc.mockResolvedValue({ data: UPDATED, error: null });
});

describe("POST /api/guest/plus-one", () => {
  it("names the plus-one and returns the updated guest", async () => {
    const res = await POST(post(BODY));
    expect(mockRpc).toHaveBeenCalledWith("name_plus_one", {
      guest_id: GUEST,
      first_name: "Sam",
      last_name: "Fake",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(UPDATED);
  });

  it("answers 401 without a guest session", async () => {
    mockRequireGuest.mockRejectedValue(new AuthError(401, "unauthenticated"));
    expect((await POST(post(BODY))).status).toBe(401);
  });

  it("answers 403 for a staff session", async () => {
    mockRequireGuest.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await POST(post(BODY))).status).toBe(403);
  });

  it("answers 403 for another household's guest", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    expect((await POST(post(BODY))).status).toBe(403);
  });

  it("answers 409 rsvp_closed after the deadline", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "rsvp_closed" },
    });
    const res = await POST(post(BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("rsvp_closed");
  });

  it("answers 409 not_a_placeholder for an already named guest", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "not_a_placeholder" },
    });
    const res = await POST(post(BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("not_a_placeholder");
  });

  it("answers 422 with issue paths for an invalid payload", async () => {
    const res = await POST(
      post({ guest_id: "x", first_name: "", last_name: "F" }),
    );
    expect(res.status).toBe(422);
    const paths = (await res.json()).error.issues.map(
      (i: { path: string[] }) => i.path[0],
    );
    expect(paths).toEqual(expect.arrayContaining(["guest_id", "first_name"]));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 422 for invalid JSON", async () => {
    expect((await POST(post("{nope", true))).status).toBe(422);
  });
});
