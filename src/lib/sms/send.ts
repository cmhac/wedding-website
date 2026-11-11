import "server-only";
import { isSmsConfigured } from "./state";
import { parseUsPhone } from "./phone";
import { getTwilioClient } from "./twilio";

/**
 * Sends one text and returns an outcome code only: never the provider's error
 * text (it can echo the number), the number or the body. A recipient who replied
 * STOP comes back as `opted_out`. There is no idempotency key for message
 * creation (research: Sending a text, and never sending twice), so callers that
 * can be retried must claim a row first and never retry an unconfirmed send.
 */

export type TextClient = {
  messages: {
    create: (params: {
      messagingServiceSid?: string;
      from?: string;
      to: string;
      body: string;
      statusCallback?: string;
    }) => Promise<{ sid: string }>;
  };
};

export type SendTextResult =
  { ok: true; sid: string } | { ok: false; code: string };

export async function sendText(args: {
  to: string;
  body: string;
  statusCallback?: string;
  client?: TextClient;
  env?: NodeJS.ProcessEnv;
}): Promise<SendTextResult> {
  const env = args.env ?? process.env;
  if (!isSmsConfigured(env)) return { ok: false, code: "not_configured" };
  // The last guard before a text leaves: a number that slipped in some other
  // way is never texted.
  const parsed = parseUsPhone(args.to);
  if (!parsed.ok) return { ok: false, code: "invalid_number" };

  const sender = env.TWILIO_MESSAGING_SERVICE_SID?.trim()
    ? { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID.trim() }
    : { from: (env.TWILIO_FROM_NUMBER ?? "").trim() };

  try {
    const client =
      args.client ?? (getTwilioClient(env) as unknown as TextClient);
    const message = await client.messages.create({
      ...sender,
      to: parsed.e164,
      body: args.body,
      ...(args.statusCallback ? { statusCallback: args.statusCallback } : {}),
    });
    return { ok: true, sid: message.sid };
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    if (code === 21610) return { ok: false, code: "opted_out" };
    if (typeof code === "number") return { ok: false, code: String(code) };
    return { ok: false, code: "send_failed" };
  }
}
