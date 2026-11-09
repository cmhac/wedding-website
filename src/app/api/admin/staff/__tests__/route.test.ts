/** @jest-environment node */
jest.mock("@/lib/log");
const mockRequireCouple = jest.fn();
jest.mock("@/lib/auth/guards", () => ({
  ...jest.requireActual("@/lib/auth/guards"),
  requireCouple: () => mockRequireCouple(),
}));
const createUser = jest.fn();
const deleteUser = jest.fn();
const insert = jest.fn();
const contactMaybeSingle = jest.fn();
const adminClient = {
  auth: { admin: { createUser, deleteUser } },
  from: jest.fn((table: string) =>
    table === "household_contacts"
      ? {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: contactMaybeSingle }) }),
          }),
        }
      : { insert },
  ),
};
jest.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => adminClient,
}));

import { AuthError } from "@/lib/auth/guards";
import { POST } from "../route";

const USER = "5f1c2b8e-1111-4222-8333-944455556666";
const post = (body: unknown) =>
  POST(
    new Request("http://localhost:3000/api/admin/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const valid = { email: "planner@example.com", display_name: "Fake Planner" };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireCouple.mockResolvedValue({ kind: "staff", role: "couple" });
  createUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  insert.mockResolvedValue({ error: null });
  contactMaybeSingle.mockResolvedValue({ data: null, error: null });
  deleteUser.mockResolvedValue({ error: null });
});

describe("POST /api/admin/staff", () => {
  it.each([
    [401, new AuthError(401, "unauthenticated")],
    [403, new AuthError(403, "forbidden")],
  ])(
    "answers %i when the guard refuses (anon, guest, or planner)",
    async (status, err) => {
      mockRequireCouple.mockRejectedValueOnce(err);
      expect((await post(valid)).status).toBe(status);
      expect(createUser).not.toHaveBeenCalled();
    },
  );

  it("refuses an address that is a household's contact with 409 household_contact, creating nothing", async () => {
    contactMaybeSingle.mockResolvedValue({ data: { id: "c1" }, error: null });
    const res = await post(valid);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("household_contact");
    expect(JSON.stringify(json)).not.toContain("@");
    expect(createUser).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses with a server error when it cannot check the household contacts", async () => {
    contactMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "x" },
    });
    expect((await post(valid)).status).toBe(500);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates the Auth user and a planner staff row", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith({
      email: valid.email,
      email_confirm: true,
    });
    expect(adminClient.from).toHaveBeenCalledWith("staff");
    expect(insert).toHaveBeenCalledWith({
      user_id: USER,
      role: "planner",
      display_name: "Fake Planner",
    });
    expect(await res.json()).toEqual({
      staff: { user_id: USER, role: "planner", display_name: "Fake Planner" },
    });
  });

  it("answers 422 for an invalid body and never ignores a client role", async () => {
    expect((await post({ email: "nope", display_name: "" })).status).toBe(422);
    await post({ ...valid, role: "couple" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "planner" }),
    );
  });

  it("answers 409 when the email already has an account", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { status: 422, code: "email_exists", message: "x" },
    });
    const res = await post(valid);
    expect(res.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes the new Auth user when the staff row cannot be inserted", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } });
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith(USER);
  });

  it("answers 500 without echoing the email when user creation fails", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "failed for planner@example.com" },
    });
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("example.com");
  });
});
