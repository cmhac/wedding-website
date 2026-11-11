/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { AuthError } from "@/lib/auth/guards";

const mockRequireStaff = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireStaff: () => mockRequireStaff(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ admin: true }),
}));
const mockAdd = jest.fn();
const mockChange = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/lib/sms/phones", () => ({
  addPhone: (...a: unknown[]) => mockAdd(...a),
  changePhone: (...a: unknown[]) => mockChange(...a),
  removePhone: (...a: unknown[]) => mockRemove(...a),
}));
jest.mock("@/lib/log");

import { POST } from "../route";
import { DELETE, PATCH } from "../[cid]/route";

const HID = "5f1c2b8e-1111-4222-8333-944455556666";
const CID = "6a1c2b8e-1111-4222-8333-944455556666";
const req = (method: string, body?: unknown, raw = false) =>
  new Request("http://localhost:3000/api/admin/households/x/phones", {
    method,
    headers: { "content-type": "application/json" },
    body:
      body === undefined
        ? undefined
        : raw
          ? (body as string)
          : JSON.stringify(body),
  });
const post =
  (ctx = { id: HID }) =>
  (b: unknown, raw = false) =>
    POST(req("POST", b, raw), { params: Promise.resolve(ctx) });
const patch =
  (ctx = { id: HID, cid: CID }) =>
  (b: unknown) =>
    PATCH(req("PATCH", b), { params: Promise.resolve(ctx) });
const del = (ctx = { id: HID, cid: CID }) =>
  DELETE(req("DELETE"), { params: Promise.resolve(ctx) });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireStaff.mockResolvedValue({ supabase: {} });
  mockAdd.mockResolvedValue({ ok: true, contactId: CID, e164: "+12025550123" });
  mockChange.mockResolvedValue({ ok: true, e164: "+12025550199" });
  mockRemove.mockResolvedValue({ ok: true, paperOnly: false });
});

describe("POST /api/admin/households/[id]/phones", () => {
  it("adds a number and returns the contact with its opt-in not asked", async () => {
    const res = await post()({ value: "(202) 555-0123" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      contact: {
        id: CID,
        kind: "phone",
        value: "+12025550123",
        sms_consent: "not_asked",
      },
    });
    expect(mockAdd).toHaveBeenCalledWith(
      { admin: true },
      HID,
      "(202) 555-0123",
    );
  });

  it.each([
    ["invalid_phone", 422],
    ["not_us_phone", 422],
    ["phone_in_use", 409],
    ["texting_not_configured", 409],
    ["not_found", 404],
    ["failed", 500],
  ])("answers %s with %s and never echoes the number", async (code, status) => {
    mockAdd.mockResolvedValue({ ok: false, code });
    const res = await post()({ value: "(202) 555-0123" });
    expect(res.status).toBe(status);
    expect(JSON.stringify(await res.json())).not.toContain("2025550123");
  });

  it("answers 422 for a missing value or invalid JSON and 404 for a bad household id", async () => {
    expect((await post()({})).status).toBe(422);
    expect((await post()("{nope", true)).status).toBe(422);
    expect((await post({ id: "nope" })({ value: "x" })).status).toBe(404);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
  ] as const)("answers %s without a staff session", async (status, code) => {
    mockRequireStaff.mockRejectedValue(new AuthError(status, code));
    expect((await post()({ value: "x" })).status).toBe(status);
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe("PATCH and DELETE /api/admin/households/[id]/phones/[cid]", () => {
  it("changes a number", async () => {
    const res = await patch()({ value: "202-555-0199" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      contact: {
        id: CID,
        kind: "phone",
        value: "+12025550199",
        sms_consent: "not_asked",
      },
    });
    expect(mockChange).toHaveBeenCalledWith(
      { admin: true },
      HID,
      CID,
      "202-555-0199",
    );
  });

  it("refuses a bad change", async () => {
    mockChange.mockResolvedValue({ ok: false, code: "not_us_phone" });
    expect((await patch()({ value: "(416) 555-0123" })).status).toBe(422);
  });

  it("removes a number and reports paper only", async () => {
    mockRemove.mockResolvedValue({ ok: true, paperOnly: true });
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paper_only: true });
  });

  it("answers 404 for a bad id and 401/403 without staff", async () => {
    expect((await del({ id: "x", cid: CID })).status).toBe(404);
    mockRequireStaff.mockRejectedValue(new AuthError(403, "forbidden"));
    expect((await del()).status).toBe(403);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
