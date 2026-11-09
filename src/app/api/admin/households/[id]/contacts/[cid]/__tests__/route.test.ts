/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
const staffClient = { fake: "staff" };
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/lib/guests/household-access", () => ({
  updateHouseholdContact: (...a: unknown[]) => mockUpdate(...a),
  removeHouseholdContact: (...a: unknown[]) => mockRemove(...a),
}));

import { AuthError } from "@/lib/auth/guards";
import { DELETE, PATCH } from "../route";

const ID = "5f1c2b8e-1111-4222-8333-944455556666";
const CID = "6a2d3c9f-2222-4333-8444-055566667777";
const ctx = (id = ID, cid = CID) => ({ params: Promise.resolve({ id, cid }) });
const url = (id = ID, cid = CID) =>
  `http://localhost:3000/api/admin/households/${id}/contacts/${cid}`;
const patch = (body: unknown, id = ID, cid = CID) =>
  PATCH(
    new Request(url(id, cid), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(id, cid),
  );
const del = (id = ID, cid = CID) =>
  DELETE(new Request(url(id, cid), { method: "DELETE" }), ctx(id, cid));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({
    kind: "staff",
    role: "couple",
    supabase: staffClient,
  });
  mockUpdate.mockResolvedValue({ ok: true });
  mockRemove.mockResolvedValue({ ok: true, paperOnly: false });
});

describe.each([
  ["PATCH", () => patch({ value: "a@example.test" })],
  ["DELETE", () => del()],
] as const)(
  "%s /api/admin/households/[id]/contacts/[cid] access",
  (_n, call) => {
    it.each([
      [401, new AuthError(401, "unauthenticated")],
      [403, new AuthError(403, "forbidden")],
    ])("answers %i when the guard refuses", async (status, err) => {
      mockRequireStaff.mockRejectedValueOnce(err);
      expect((await call()).status).toBe(status);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
    });
  },
);

describe("PATCH /api/admin/households/[id]/contacts/[cid]", () => {
  it("changes the address (which clears its delivery flag) and answers 200", async () => {
    const res = await patch({ value: "Other@Example.test" });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      staffClient,
      ID,
      CID,
      "Other@Example.test",
    );
    expect(await res.json()).toEqual({
      contact: { id: CID, kind: "email", value: "other@example.test" },
    });
  });

  it.each([
    ["email_in_use", 409],
    ["staff_account", 409],
    ["not_found", 404],
    ["invalid_payload", 422],
  ])("maps %s to %i without naming an address", async (code, status) => {
    mockUpdate.mockResolvedValue({ ok: false, code });
    const res = await patch({ value: "a@example.test" });
    expect(res.status).toBe(status);
    expect(JSON.stringify(await res.json())).not.toContain("@");
  });

  it("answers 422 for a bad body and 404 for malformed ids", async () => {
    expect((await patch({ value: "nope" })).status).toBe(422);
    expect((await patch({})).status).toBe(422);
    expect((await patch({ value: "a@example.test" }, "x")).status).toBe(404);
    expect((await patch({ value: "a@example.test" }, ID, "x")).status).toBe(
      404,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/households/[id]/contacts/[cid]", () => {
  it("removes the address and answers 200 with paper_only", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith(staffClient, ID, CID);
    expect(await res.json()).toEqual({ paper_only: false });
  });

  it("says paper_only: true when it was the last address", async () => {
    mockRemove.mockResolvedValue({ ok: true, paperOnly: true });
    expect(await (await del()).json()).toEqual({ paper_only: true });
  });

  it("answers 404 for an unknown or malformed household or contact", async () => {
    mockRemove.mockResolvedValue({ ok: false, code: "not_found" });
    expect((await del()).status).toBe(404);
    expect((await del("x")).status).toBe(404);
    expect((await del(ID, "x")).status).toBe(404);
  });

  it("answers 500 for any other failure", async () => {
    mockRemove.mockResolvedValue({ ok: false, code: "failed" });
    expect((await del()).status).toBe(500);
  });
});
