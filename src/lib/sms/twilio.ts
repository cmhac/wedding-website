import "server-only";
import twilio from "twilio";
import type { EnvLike } from "./state";

/**
 * The only file that imports the Twilio package (research: The provider
 * library). Everything else uses the small interfaces in `send.ts`, so tests
 * pass a fake and nothing else depends on the package.
 */

export function getTwilioClient(env: EnvLike = process.env) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio is not configured");
  return twilio(sid, token);
}

/**
 * Checks `X-Twilio-Signature` with the library, as Twilio advises (do not write
 * your own). `url` must be the exact public URL Twilio called and `params` every
 * posted field.
 */
export function isValidTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
  env: EnvLike = process.env,
): boolean {
  const token = env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  try {
    return twilio.validateRequest(token, signature, url, params);
  } catch {
    return false;
  }
}
