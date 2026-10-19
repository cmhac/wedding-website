import { z } from "zod";
import { errorResponse } from "@/lib/api-errors";
import { statusForEventType } from "@/lib/campaigns/status";
import { getResend } from "@/lib/email/resend";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Resend webhook (contracts/http-endpoints.md).
 *
 * Event names checked against Resend's webhook event reference
 * (https://resend.com/docs/webhooks/event-types) and the installed `resend`
 * SDK's `WebhookEvent` type on 2026-10-19: the current names are `email.sent`,
 * `email.delivered`, `email.bounced` and `email.complained`, as the contract
 * assumes. Resend also sends others (`email.delivery_delayed`, `email.opened`,
 * `email.clicked`, `email.failed`, `email.suppressed`, `email.scheduled`,
 * `email.received`, plus contact and domain events); those are acknowledged
 * with 200 and ignored. The handled set lives in `statusForEventType`.
 *
 * The signature is verified over the raw body with the SDK, which fails
 * deliveries older than five minutes by design. The `svix-id` header is the
 * event id, so a redelivery is a no-op in `record_message_event`, which also
 * applies the status ranking so an out-of-order event never moves a message
 * backwards. Unknown message ids (for example sign-in emails) are ignored.
 */

const payloadSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({ email_id: z.string().min(1).optional() }).passthrough(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  let verified: unknown;
  try {
    if (!secret) throw new Error("missing secret");
    verified = getResend().webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    });
  } catch {
    log.warn("resend_webhook", { outcome: "bad_signature" });
    return errorResponse(400, "invalid_signature", "Invalid signature.");
  }

  const parsed = payloadSchema.safeParse(verified);
  if (!parsed.success || statusForEventType(parsed.data.type) === null) {
    return Response.json({ ok: true, ignored: true });
  }
  const { type, created_at, data } = parsed.data;
  if (!data.email_id) return Response.json({ ok: true, ignored: true });

  const { error } = await createAdminSupabase().rpc("record_message_event", {
    provider_event_id: request.headers.get("svix-id") ?? "",
    provider_message_id: data.email_id,
    type,
    occurred_at: created_at ?? new Date().toISOString(),
  });
  if (error) {
    // A 500 makes Resend retry the delivery.
    log.error("resend_webhook", { outcome: "record_failed", type });
    return errorResponse(500, "server_error", "The event was not recorded.");
  }
  return Response.json({ ok: true });
}
