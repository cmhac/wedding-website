/** @jest-environment node */
jest.mock("server-only", () => ({}), { virtual: true });
import { sendText, type TextClient } from "../send";

const env = {
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_MESSAGING_SERVICE_SID: "MGtest",
} as NodeJS.ProcessEnv;

function fakeClient(result: "ok" | { code: number }) {
  const create = jest.fn(async () => {
    if (result === "ok") return { sid: "SM123" };
    throw Object.assign(new Error("Twilio said: to +12025550123 failed"), {
      code: result.code,
    });
  });
  return { client: { messages: { create } } as TextClient, create };
}

describe("sendText", () => {
  it("sends through the messaging service and returns the message id", async () => {
    const { client, create } = fakeClient("ok");
    const out = await sendText({
      to: "+12025550123",
      body: "Hello",
      statusCallback: "https://example.org/api/webhooks/twilio",
      client,
      env,
    });
    expect(out).toEqual({ ok: true, sid: "SM123" });
    expect(create).toHaveBeenCalledWith({
      messagingServiceSid: "MGtest",
      to: "+12025550123",
      body: "Hello",
      statusCallback: "https://example.org/api/webhooks/twilio",
    });
  });

  it("uses the from number when there is no messaging service", async () => {
    const { client, create } = fakeClient("ok");
    await sendText({
      to: "+12025550123",
      body: "Hello",
      client,
      env: {
        TWILIO_ACCOUNT_SID: "ACtest",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_FROM_NUMBER: "+15005550006",
      } as NodeJS.ProcessEnv,
    });
    expect(create).toHaveBeenCalledWith({
      from: "+15005550006",
      to: "+12025550123",
      body: "Hello",
    });
  });

  it("returns only a code for a refused send, never the provider's text", async () => {
    const { client } = fakeClient({ code: 30006 });
    const out = await sendText({
      to: "+12025550123",
      body: "Hello",
      client,
      env,
    });
    expect(out).toEqual({ ok: false, code: "30006" });
    expect(JSON.stringify(out)).not.toContain("2025550123");
  });

  it("calls a recipient who replied STOP opted_out", async () => {
    const { client } = fakeClient({ code: 21610 });
    expect(
      await sendText({ to: "+12025550123", body: "Hi", client, env }),
    ).toEqual({ ok: false, code: "opted_out" });
  });

  it("turns anything unexpected into send_failed", async () => {
    const client = {
      messages: {
        create: jest.fn(async () => {
          throw new Error("boom");
        }),
      },
    } as unknown as TextClient;
    expect(
      await sendText({ to: "+12025550123", body: "Hi", client, env }),
    ).toEqual({ ok: false, code: "send_failed" });
  });

  it("does nothing when texting is not configured", async () => {
    const { client, create } = fakeClient("ok");
    expect(
      await sendText({
        to: "+12025550123",
        body: "Hi",
        client,
        env: {} as NodeJS.ProcessEnv,
      }),
    ).toEqual({ ok: false, code: "not_configured" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a number that is not a United States number before any call", async () => {
    const { client, create } = fakeClient("ok");
    expect(
      await sendText({ to: "+14165550123", body: "Hi", client, env }),
    ).toEqual({ ok: false, code: "invalid_number" });
    expect(create).not.toHaveBeenCalled();
  });
});
