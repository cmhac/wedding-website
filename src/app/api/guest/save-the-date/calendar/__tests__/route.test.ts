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
};
const rpc = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  mockRequireSignedIn.mockResolvedValue({ supabase: { rpc } });
  rpc.mockResolvedValue({ data: raw, error: null });
});

describe("GET /api/guest/save-the-date/calendar", () => {
  it("returns the calendar file as a download, uncached", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="save-the-date.ics"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("DTSTART;VALUE=DATE:20270918");
    expect(body).toContain("SEQUENCE:2");
  });

  it("holds no household data", async () => {
    const body = await (await GET()).text();
    expect(body).not.toMatch(/household|\/i\/|token/i);
  });

  it("is 409 not_ready when the date is not set", async () => {
    rpc.mockResolvedValue({ data: { ...raw, date: null }, error: null });
    const res = await GET();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("not_ready");
  });

  it("is 401 when not signed in and 403 when neither guest nor staff", async () => {
    mockRequireSignedIn.mockRejectedValue(
      new AuthError(401, "unauthenticated"),
    );
    expect((await GET()).status).toBe(401);
    mockRequireSignedIn.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await GET()).status).toBe(403);
  });
});
