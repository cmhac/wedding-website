/** @jest-environment node */
import { Webhook } from "standardwebhooks";
import { HookVerificationError, verifyHook } from "../verify-hook";

const base64 = Buffer.from("test-secret-bytes-0123456789").toString("base64");
const secret = `v1,whsec_${base64}`;

function sign(body: string, id = "msg_1", at = new Date()) {
  const signature = new Webhook(base64).sign(id, at, body);
  return {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(at.getTime() / 1000)),
    "webhook-signature": signature,
  };
}

describe("verifyHook", () => {
  const body = JSON.stringify({ hello: "world" });

  it("returns the payload for a valid signature over the raw body", () => {
    expect(verifyHook(body, sign(body), secret)).toEqual({ hello: "world" });
  });

  it("accepts a Headers object", () => {
    expect(verifyHook(body, new Headers(sign(body)), secret)).toEqual({
      hello: "world",
    });
  });

  it("rejects a re-serialised body (verification uses the raw bytes)", () => {
    const headers = sign(body);
    expect(() => verifyHook(`${body} `, headers, secret)).toThrow(
      HookVerificationError,
    );
  });

  it("rejects missing, bad and stale signatures", () => {
    expect(() => verifyHook(body, {}, secret)).toThrow(HookVerificationError);
    expect(() =>
      verifyHook(
        body,
        { ...sign(body), "webhook-signature": "v1,AAAA" },
        secret,
      ),
    ).toThrow(HookVerificationError);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    expect(() => verifyHook(body, sign(body, "m", old), secret)).toThrow(
      HookVerificationError,
    );
  });

  it("rejects when no secret is configured", () => {
    expect(() => verifyHook(body, sign(body), "")).toThrow(
      HookVerificationError,
    );
  });
});
