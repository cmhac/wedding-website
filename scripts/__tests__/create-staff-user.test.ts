/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import { createStaffUser, parseArgs, STAFF_ROLES } from "../create-staff-user";

function fakeAdmin(
  options: {
    createError?: { message: string };
    insertError?: { message: string };
  } = {},
) {
  const createUser = jest.fn(async (_attrs: object) => ({
    data: options.createError ? { user: null } : { user: { id: "user-123" } },
    error: options.createError ?? null,
  }));
  const deleteUser = jest.fn(async (_id: string) => ({ error: null }));
  const insert = jest.fn(async (_row: object) => ({
    error: options.insertError ?? null,
  }));
  const from = jest.fn((_table: string) => ({ insert }));
  const admin = { auth: { admin: { createUser, deleteUser } }, from };
  return { admin, createUser, deleteUser, insert, from };
}

const input = {
  email: "planner@example.com",
  displayName: "Fake Planner",
  role: "planner",
};

describe("parseArgs", () => {
  it("reads email, display name, and role", () => {
    expect(parseArgs(["a@example.com", "Fake Name", "couple"])).toEqual({
      email: "a@example.com",
      displayName: "Fake Name",
      role: "couple",
    });
  });

  it("refuses an unknown role", () => {
    expect(() => parseArgs(["a@example.com", "Fake", "admin"])).toThrow(
      /role/i,
    );
  });

  it("refuses a missing argument", () => {
    expect(() => parseArgs(["a@example.com", "Fake"])).toThrow(/usage/i);
  });

  it("refuses an invalid email", () => {
    expect(() => parseArgs(["nope", "Fake", "couple"])).toThrow(/email/i);
  });

  it("offers exactly couple and planner", () => {
    expect([...STAFF_ROLES]).toEqual(["couple", "planner"]);
  });
});

describe("createStaffUser", () => {
  it("creates the Auth user and the staff row, returning only the id", async () => {
    const { admin, createUser, insert, from } = fakeAdmin();
    const id = await createStaffUser(admin as never, input as never);
    expect(id).toBe("user-123");
    expect(createUser).toHaveBeenCalledWith({
      email: "planner@example.com",
      email_confirm: true,
    });
    expect(from).toHaveBeenCalledWith("staff");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-123",
      role: "planner",
      display_name: "Fake Planner",
    });
  });

  it("refuses an unknown role before touching Auth", async () => {
    const { admin, createUser } = fakeAdmin();
    await expect(
      createStaffUser(admin as never, { ...input, role: "boss" } as never),
    ).rejects.toThrow(/role/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("throws without the email when the Auth user cannot be created", async () => {
    const { admin, insert } = fakeAdmin({
      createError: { message: "already registered planner@example.com" },
    });
    const error = await createStaffUser(admin as never, input as never).catch(
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("planner@example.com");
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes the new Auth user if the staff row cannot be inserted", async () => {
    const { admin, deleteUser } = fakeAdmin({
      insertError: { message: "boom" },
    });
    await expect(
      createStaffUser(admin as never, input as never),
    ).rejects.toThrow();
    expect(deleteUser).toHaveBeenCalledWith("user-123");
  });
});
