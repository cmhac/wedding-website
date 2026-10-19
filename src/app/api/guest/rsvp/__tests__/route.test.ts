/** @jest-environment node */
import { AuthError } from "@/lib/auth/guards";

const mockRpc = jest.fn();
const mockRequireGuest = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireGuest: () => mockRequireGuest(),
}));

import { GET, PUT } from "../route";

const GUEST = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const RSVP = { household: { display_name: "The Fakes" }, guests: [] };
const PAYLOAD = {
  message_to_couple: "See you there",
  guests: [
    { guest_id: GUEST, responses: [{ event_id: EVENT, status: "attending" }] },
  ],
};

function put(body: unknown, raw = false) {
  return new Request("http://localhost:3000/api/guest/rsvp", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireGuest.mockResolvedValue({ supabase: { rpc: mockRpc } });
  mockRpc.mockResolvedValue({ data: RSVP, error: null });
});

describe.each([
  ["GET", () => GET()],
  ["PUT", () => PUT(put(PAYLOAD))],
] as const)("%s /api/guest/rsvp access", (_name, call) => {
  it("answers 401 without a guest session", async () => {
    mockRequireGuest.mockRejectedValue(new AuthError(401, "unauthenticated"));
    const res = await call();
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 403 for a staff session", async () => {
    mockRequireGuest.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await call()).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 403 when the database says not_a_guest", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "not_a_guest" },
    });
    expect((await call()).status).toBe(403);
  });
});

describe("GET /api/guest/rsvp", () => {
  it("returns the household from get_my_rsvp", async () => {
    const res = await GET();
    expect(mockRpc).toHaveBeenCalledWith("get_my_rsvp");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RSVP);
  });
});

const COURSE = "33333333-3333-4333-8333-333333333333";
const DISH = "44444444-4444-4444-8444-444444444444";
const MEAL_PAYLOAD = {
  guests: [
    {
      guest_id: GUEST,
      dietary_notes: "No shellfish please",
      dietary: [
        { category_key: "nuts", severity: "allergy", details: null },
        { category_key: "vegetarian", severity: "preference" },
      ],
      responses: [{ event_id: EVENT, status: "attending" }],
      meals: [{ course_id: COURSE, dish_id: DISH }],
    },
  ],
};

describe("PUT /api/guest/rsvp meals and dietary", () => {
  it("passes meals and dietary through to the database call", async () => {
    const res = await PUT(put(MEAL_PAYLOAD));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("submit_household_rsvp", {
      payload: MEAL_PAYLOAD,
    });
  });

  it("answers 422 invalid_meal when the database refuses the dish", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "invalid_meal" },
    });
    const res = await PUT(put(MEAL_PAYLOAD));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("invalid_meal");
  });

  it("rejects a dietary severity other than allergy or preference", async () => {
    const bad = structuredClone(MEAL_PAYLOAD);
    bad.guests[0].dietary[0].severity = "dislike";
    const res = await PUT(put(bad));
    expect(res.status).toBe(422);
    expect((await res.json()).error.issues[0].path).toEqual([
      "guests",
      0,
      "dietary",
      0,
      "severity",
    ]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a meal whose ids are not uuids", async () => {
    const bad = structuredClone(MEAL_PAYLOAD);
    bad.guests[0].meals[0].dish_id = "not-a-uuid";
    const res = await PUT(put(bad));
    expect(res.status).toBe(422);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns the menu and selections from the database untouched on GET", async () => {
    const withMenu = {
      household: { display_name: "The Fakes" },
      guests: [
        {
          invitations: [
            {
              menu: {
                status: "published",
                courses: [{ id: COURSE, dishes: [{ id: DISH, tags: [] }] }],
                selection: [{ course_id: COURSE, dish_id: DISH }],
              },
            },
          ],
        },
      ],
    };
    mockRpc.mockResolvedValue({ data: withMenu, error: null });
    expect(await (await GET()).json()).toEqual(withMenu);
  });
});

describe("PUT /api/guest/rsvp", () => {
  it("submits the payload and returns the updated RSVP", async () => {
    const res = await PUT(put(PAYLOAD));
    expect(mockRpc).toHaveBeenCalledWith("submit_household_rsvp", {
      payload: PAYLOAD,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RSVP);
  });

  it("answers 403 for another household's ids", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    const res = await PUT(put(PAYLOAD));
    expect(res.status).toBe(403);
  });

  it("answers 409 rsvp_closed after the deadline", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "rsvp_closed" },
    });
    const res = await PUT(put(PAYLOAD));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("rsvp_closed");
  });

  it("answers 422 with issue paths for an invalid payload", async () => {
    const res = await PUT(
      put({
        guests: [
          {
            guest_id: GUEST,
            responses: [{ event_id: EVENT, status: "maybe" }],
          },
        ],
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.issues[0].path).toEqual([
      "guests",
      0,
      "responses",
      0,
      "status",
    ]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 422 for invalid JSON", async () => {
    expect((await PUT(put("{nope", true))).status).toBe(422);
  });

  it("answers 500 without database text for unexpected errors", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "boom secret" },
    });
    const res = await PUT(put(PAYLOAD));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
