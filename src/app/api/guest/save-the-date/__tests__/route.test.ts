/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { AuthError } from "@/lib/auth/guards";

const mockRequireSignedIn = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireSignedIn: () => mockRequireSignedIn(),
}));

import { GET } from "../route";

const raw = {
  couple_names: "Chris & Hannah",
  date: "2027-09-18",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  revision: 2,
  wedding_event_set: true,
};
const rpc = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  mockRequireSignedIn.mockResolvedValue({ supabase: { rpc } });
  rpc.mockResolvedValue({ data: raw, error: null });
});

describe("GET /api/guest/save-the-date", () => {
  it("returns the card's facts and the calendar choices", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      couple_names: "Chris & Hannah",
      date: "2027-09-18",
      place: "Napa Valley, California",
      note: "Invitation to follow",
    });
    expect(body.calendar.file).toBe("/api/guest/save-the-date/calendar");
    expect(body.calendar.google).toContain("calendar.google.com");
    expect(body.calendar.outlook).toContain("outlook.live.com");
    expect(rpc).toHaveBeenCalledWith("get_save_the_date");
  });

  it("has no date and no calendar when the wedding date is not set", async () => {
    rpc.mockResolvedValue({ data: { ...raw, date: null }, error: null });
    const body = await (await GET()).json();
    expect(body.date).toBeNull();
    expect(body.calendar).toBeNull();
  });

  it("holds nothing about any household or personal link", async () => {
    rpc.mockResolvedValue({
      data: { ...raw, household_id: "h-1", email: "x@example.test" },
      error: null,
    });
    const text = JSON.stringify(await (await GET()).json());
    expect(text).not.toMatch(/household|x@example|\/i\/|token/i);
  });

  it("is 401 when not signed in and 403 when signed in as neither guest nor staff", async () => {
    mockRequireSignedIn.mockRejectedValue(
      new AuthError(401, "unauthenticated"),
    );
    expect((await GET()).status).toBe(401);
    mockRequireSignedIn.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await GET()).status).toBe(403);
  });

  it("is a plain server error when the details cannot be read", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });
});
