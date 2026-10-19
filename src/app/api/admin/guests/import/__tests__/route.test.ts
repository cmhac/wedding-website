/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ fake: "admin" }),
}));
const mockLink = jest.fn();
jest.mock("@/lib/guests/household-access", () => ({
  linkPendingHouseholdAccounts: (...a: unknown[]) => mockLink(...a),
}));

import { AuthError } from "@/lib/auth/guards";
import { POST } from "../route";

const HEADER =
  "household_ref,household_name,contact_email,first_name,last_name,event:ceremony";

const rpc = jest.fn();
const sessionClient = {
  from: () => ({
    select: async () => ({ data: [{ slug: "ceremony" }], error: null }),
  }),
  rpc: (...a: unknown[]) => rpc(...a),
};

const request = (csv: string) =>
  new Request("http://localhost:3000/api/admin/guests/import", {
    method: "POST",
    headers: { "content-type": "text/csv" },
    body: csv,
  });

const valid = [
  HEADER,
  "h1,Test Household,test@example.com,Ann,Example,yes",
  "h1,Test Household,test@example.com,Bob,Example,",
].join("\n");

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "planner",
    supabase: sessionClient,
  });
  rpc.mockResolvedValue({
    data: {
      created: { households: 1, guests: 2, invitations: 1 },
      errors: [],
    },
    error: null,
  });
  mockLink.mockResolvedValue({ linked: 1, failed: 0 });
});

describe("POST /api/admin/guests/import", () => {
  it("returns 401 without a session and 403 for a guest", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AuthError(401, "unauthenticated"),
    );
    expect((await POST(request(valid))).status).toBe(401);
    mockRequireStaff.mockRejectedValueOnce(new AuthError(403, "forbidden"));
    expect((await POST(request(valid))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("imports a valid CSV and returns the created counts with no errors", async () => {
    const res = await POST(request(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      created: { households: 1, guests: 2, invitations: 1 },
      errors: [],
    });
    expect(rpc).toHaveBeenCalledWith(
      "import_households",
      expect.objectContaining({ rows: expect.any(Array) }),
    );
  });

  it("links sign-in accounts for the new households with the service-role client", async () => {
    await POST(request(valid));
    expect(mockLink).toHaveBeenCalledWith({ fake: "admin" });
  });

  it("returns the bad row's error and still creates the valid households", async () => {
    const csv = [valid, "h2,Other Household,not-an-email,Cy,Example,"].join(
      "\n",
    );
    const res = await POST(request(csv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created.households).toBe(1);
    expect(json.errors).toEqual([
      expect.objectContaining({ row: 4, field: "contact_email" }),
    ]);
    expect(JSON.stringify(json.errors)).not.toContain("not-an-email");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 422 for an empty body and for a file missing required columns", async () => {
    expect((await POST(request(""))).status).toBe(422);
    const res = await POST(request("first_name\nAnn"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("invalid_file");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 500 when the database call fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(request(valid))).status).toBe(500);
  });
});
