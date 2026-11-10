/** @jest-environment node */
import { requestStaffLink } from "../staff-sign-in";

const signInWithOtp = jest.fn();
const supabase = { auth: { signInWithOtp } } as never;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN;
  signInWithOtp.mockResolvedValue({ data: {}, error: null });
});

describe("requestStaffLink", () => {
  it("asks for a staff-audience link without creating users", async () => {
    const outcome = await requestStaffLink(supabase, "planner@example.com");
    expect(outcome).toBe("requested");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "planner@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "http://localhost:3000/auth/callback?audience=staff",
      },
    });
  });

  it("returns the error code when Supabase refuses, and never throws", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "user_not_found" },
    });
    expect(await requestStaffLink(supabase, "x@example.com")).toBe(
      "user_not_found",
    );
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "no code" },
    });
    expect(await requestStaffLink(supabase, "x@example.com")).toBe("unknown");
  });

  it("returns exception when the call throws", async () => {
    signInWithOtp.mockRejectedValue(new Error("down"));
    expect(await requestStaffLink(supabase, "x@example.com")).toBe("exception");
  });

  it.each([
    "household-123@households.invalid",
    "Household-123@HOUSEHOLDS.INVALID",
    "  household-123@households.invalid ",
  ])("makes no call for a household account address (%s)", async (address) => {
    expect(await requestStaffLink(supabase, address)).toBe("household_account");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("follows HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN", async () => {
    process.env.HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN = "accounts.example.org";
    expect(
      await requestStaffLink(supabase, "household-1@accounts.example.org"),
    ).toBe("household_account");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
