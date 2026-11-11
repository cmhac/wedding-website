/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { getSmsState, isSmsConfigured } from "../state";

const full = {
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_MESSAGING_SERVICE_SID: "MGtest",
};

describe("isSmsConfigured", () => {
  it("is true with the account, the token and a messaging service", () => {
    expect(isSmsConfigured(full)).toBe(true);
  });

  it("is true with a from number instead of a messaging service", () => {
    expect(
      isSmsConfigured({
        TWILIO_ACCOUNT_SID: "ACtest",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_FROM_NUMBER: "+15005550006",
      }),
    ).toBe(true);
  });

  it.each([
    ["no settings", {}],
    ["no sender", { ...full, TWILIO_MESSAGING_SERVICE_SID: undefined }],
    ["no token", { ...full, TWILIO_AUTH_TOKEN: "" }],
    ["no account", { ...full, TWILIO_ACCOUNT_SID: "   " }],
  ])("is false with %s", (_name, env) => {
    expect(isSmsConfigured(env)).toBe(false);
  });
});

function dbWith(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ maybeSingle }));
  const from = jest.fn(() => ({ select }));
  return { db: { from } as never, from };
}

describe("getSmsState", () => {
  it("is available only when configured and switched on", async () => {
    const { db } = dbWith({ data: { sms_enabled: true }, error: null });
    expect(await getSmsState(db, full)).toEqual({
      configured: true,
      enabled: true,
      available: true,
    });
  });

  it("is not available when configured but switched off", async () => {
    const { db } = dbWith({ data: { sms_enabled: false }, error: null });
    expect(await getSmsState(db, full)).toEqual({
      configured: true,
      enabled: false,
      available: false,
    });
  });

  it("does not read the database when not configured", async () => {
    const { db, from } = dbWith({ data: { sms_enabled: true }, error: null });
    expect(await getSmsState(db, {})).toEqual({
      configured: false,
      enabled: false,
      available: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("fails closed on a database error", async () => {
    const { db } = dbWith({ data: null, error: { message: "down" } });
    expect((await getSmsState(db, full)).available).toBe(false);
  });
});
