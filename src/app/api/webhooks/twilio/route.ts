import { errorResponse } from "@/lib/api-errors";
import { log } from "@/lib/log";
import { isSmsConfigured } from "@/lib/sms/state";
import { statusForTwilio } from "@/lib/sms/status";
import { isValidTwilioSignature } from "@/lib/sms/twilio";
import { statusCallbackUrl } from "@/lib/sms/urls";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Twilio delivery notifications (contracts/twilio-webhook.md). The signature is
 * checked with Twilio's library over the public URL (built from the site
 * address, because the request's own URL differs behind a proxy) and every
 * posted field. Twilio sends no event id, so the key is the message id plus the
 * status, which makes a redelivery a no-op in the database function, which also
 * never lets an earlier status move a message backwards. Unknown messages (the
 * sign-in and confirmation texts have no campaign row) are acknowledged and
 * dropped. Logs hold outcome codes only: never a number, body or message id.
 */
export async function POST(request: Request) {
  // Not configured: Twilio cannot be calling, so there is nothing to check.
  if (!isSmsConfigured()) return Response.json({ ok: true, ignored: true });

  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const url = statusCallbackUrl();
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!url || !isValidTwilioSignature(signature, url, params)) {
    log.warn("twilio_webhook", { outcome: "bad_signature" });
    return errorResponse(403, "invalid_signature", "Invalid signature.");
  }

  const sid = params.MessageSid;
  const twilioStatus = params.MessageStatus ?? "";
  const status = statusForTwilio(twilioStatus);
  if (!sid || !status) return Response.json({ ok: true, ignored: true });

  const { error } = await createAdminSupabase().rpc(
    "record_text_status" as never,
    {
      provider_event_id: `${sid}:${twilioStatus}`,
      provider_message_id: sid,
      status,
      error_code: params.ErrorCode || null,
      occurred_at: new Date().toISOString(),
    } as never,
  );
  if (error) {
    // A 500 makes Twilio retry the delivery.
    log.error("twilio_webhook", { outcome: "record_failed", status });
    return errorResponse(500, "server_error", "The event was not recorded.");
  }
  return Response.json({ ok: true });
}
