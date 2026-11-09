/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import {
  convertHouseholdAccounts,
  formatConversionReport,
} from "../convert-household-accounts";

type Household = { id: string; auth_user_id: string | null };

function fakeAdmin(
  households: Household[],
  emails: Record<string, string | null>,
  options: { failUpdateFor?: string } = {},
) {
  const getUserById = jest.fn(async (id: string) => ({
    data: { user: id in emails ? { id, email: emails[id] } : null },
    error: id in emails ? null : { message: "not found" },
  }));
  const updateUserById = jest.fn(async (id: string, _attrs: object) => ({
    data: { user: {} },
    error: id === options.failUpdateFor ? { message: "boom" } : null,
  }));
  const not = jest.fn(async (_c: string, _op: string, _v: unknown) => ({
    data: households.filter((h) => h.auth_user_id !== null),
    error: null,
  }));
  const select = jest.fn((_cols: string) => ({ not }));
  const from = jest.fn((_table: string) => ({ select }));
  return {
    admin: { from, auth: { admin: { getUserById, updateUserById } } } as never,
    getUserById,
    updateUserById,
  };
}

const households: Household[] = [
  { id: "h1", auth_user_id: "u1" },
  { id: "h2", auth_user_id: "u2" },
  { id: "h3", auth_user_id: "u3" },
  { id: "h4", auth_user_id: null },
];

describe("convertHouseholdAccounts", () => {
  it("renames a real-address account to the synthetic address", async () => {
    const f = fakeAdmin([households[0]], { u1: "real@example.test" });
    const res = await convertHouseholdAccounts(f.admin);
    expect(f.updateUserById).toHaveBeenCalledWith("u1", {
      email: "household-h1@households.invalid",
      email_confirm: true,
    });
    expect(res).toEqual({ renamed: 1, alreadySynthetic: 0, failed: 0 });
  });

  it("leaves accounts that already have the synthetic address", async () => {
    const f = fakeAdmin([households[0]], {
      u1: "household-h1@households.invalid",
    });
    const res = await convertHouseholdAccounts(f.admin);
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(res).toEqual({ renamed: 0, alreadySynthetic: 1, failed: 0 });
  });

  it("is idempotent: a second run changes nothing", async () => {
    const emails: Record<string, string | null> = { u1: "real@example.test" };
    const f = fakeAdmin([households[0]], emails);
    await convertHouseholdAccounts(f.admin);
    emails.u1 = "household-h1@households.invalid";
    const second = await convertHouseholdAccounts(f.admin);
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(second.renamed).toBe(0);
  });

  it("skips households with no Auth user and counts failures without stopping", async () => {
    const f = fakeAdmin(
      households,
      { u1: "a@example.test", u2: "b@example.test", u3: "c@example.test" },
      { failUpdateFor: "u2" },
    );
    const res = await convertHouseholdAccounts(f.admin);
    expect(res).toEqual({ renamed: 2, alreadySynthetic: 0, failed: 1 });
    expect(f.updateUserById).toHaveBeenCalledTimes(3);
  });

  it("uses the configured domain", async () => {
    const f = fakeAdmin([households[0]], { u1: "real@example.test" });
    await convertHouseholdAccounts(f.admin, "mail.example");
    expect(f.updateUserById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ email: "household-h1@mail.example" }),
    );
  });

  it("counts a missing user as a failure", async () => {
    const f = fakeAdmin([households[0]], {});
    expect(await convertHouseholdAccounts(f.admin)).toEqual({
      renamed: 0,
      alreadySynthetic: 0,
      failed: 1,
    });
  });
});

describe("formatConversionReport", () => {
  it("prints counts only", () => {
    const text = formatConversionReport({
      renamed: 2,
      alreadySynthetic: 1,
      failed: 0,
    });
    expect(text).toContain("2 renamed");
    expect(text).toContain("1 already");
    expect(text).not.toContain("@");
  });
});
