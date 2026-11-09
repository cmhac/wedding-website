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
  INVITE_LINK_SECRET: "invite-secret-fake-long-enough-for-hmac-0123456789",
};

describe("getServerEnv", () => {
  it("returns parsed values", () => {
    const env = getServerEnv(valid);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("service-fake");
  });

  it("defaults GUEST_RSVP_PATH to the home page", () => {
    expect(getServerEnv(valid).GUEST_RSVP_PATH).toBe("/");
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

describe("invite link settings", () => {
  it("requires INVITE_LINK_SECRET on the server", () => {
    const { INVITE_LINK_SECRET: _omit, ...rest } = valid;
    void _omit;
    expect(() => getServerEnv(rest)).toThrow(/INVITE_LINK_SECRET/);
  });

  it("defaults the household account domain to households.invalid", () => {
    expect(getServerEnv(valid).HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN).toBe(
      "households.invalid",
    );
  });

  it("keeps a provided household account domain", () => {
    expect(
      getServerEnv({ ...valid, HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN: "mail.example" })
        .HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN,
    ).toBe("mail.example");
  });

  it("never exposes the secret to the browser", () => {
    const env = getPublicEnv(valid) as Record<string, unknown>;
    expect(env.INVITE_LINK_SECRET).toBeUndefined();
    expect(Object.keys(env).join()).not.toMatch(/INVITE_LINK_SECRET/);
    expect("NEXT_PUBLIC_INVITE_LINK_SECRET" in env).toBe(false);
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
