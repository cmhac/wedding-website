import { getPublicEnv, getServerEnv } from "../env";

const valid = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-fake",
  SUPABASE_SERVICE_ROLE_KEY: "service-fake",
  RESEND_API_KEY: "resend-fake",
  EMAIL_FROM: "Fake <hello@example.com>",
  SEND_EMAIL_HOOK_SECRET: "hook-fake",
  RESEND_WEBHOOK_SECRET: "webhook-fake",
  CRON_SECRET: "cron-fake",
};

describe("getServerEnv", () => {
  it("returns parsed values", () => {
    const env = getServerEnv(valid);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("service-fake");
  });

  it("defaults GUEST_RSVP_PATH to /rsvp", () => {
    expect(getServerEnv(valid).GUEST_RSVP_PATH).toBe("/rsvp");
  });

  it("keeps a provided GUEST_RSVP_PATH", () => {
    expect(
      getServerEnv({ ...valid, GUEST_RSVP_PATH: "/reply" }).GUEST_RSVP_PATH,
    ).toBe("/reply");
  });

  it("names the missing variable in the error", () => {
    const { RESEND_API_KEY: _omit, ...rest } = valid;
    void _omit;
    expect(() => getServerEnv(rest)).toThrow(/RESEND_API_KEY/);
  });

  it("never prints values in the error", () => {
    const bad = { ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url-secret-xyz" };
    try {
      getServerEnv(bad);
      throw new Error("should have thrown");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(message).not.toMatch(/secret-xyz/);
    }
  });

  it("treats empty strings as missing", () => {
    expect(() => getServerEnv({ ...valid, CRON_SECRET: "" })).toThrow(
      /CRON_SECRET/,
    );
  });

  it("rejects a GUEST_RSVP_PATH that is not a relative path", () => {
    expect(() =>
      getServerEnv({ ...valid, GUEST_RSVP_PATH: "https://evil.example" }),
    ).toThrow(/GUEST_RSVP_PATH/);
  });
});

describe("getPublicEnv", () => {
  it("needs only the public variables", () => {
    const env = getPublicEnv({
      NEXT_PUBLIC_SITE_URL: valid.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-fake");
  });

  it("does not expose server-only variables", () => {
    const env = getPublicEnv(valid) as Record<string, unknown>;
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});
