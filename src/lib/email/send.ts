import { getResend } from "./resend";
import type { RenderedEmail } from "./templates";

export type SendResult =
  { ok: true; providerMessageId: string | null } | { ok: false; code: string };

export type EmailClient = {
  emails: {
    send: (
      payload: {
        from: string;
        to: string;
        subject: string;
        html: string;
        text: string;
      },
      options?: { idempotencyKey?: string },
    ) => Promise<{
      data: { id: string } | null;
      error: { name?: string } | null;
    }>;
  };
};

/**
 * Sends a rendered email. Pass an idempotency key (for campaign messages, the
 * message id) so a retry never sends twice. Returns an outcome code only and
 * never the provider's error text, which may echo the address.
 */
export async function sendEmail(args: {
  to: string;
  rendered: RenderedEmail;
  idempotencyKey?: string;
  client?: EmailClient;
}): Promise<SendResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { ok: false, code: "email_from_missing" };
  try {
    const client = args.client ?? (getResend() as unknown as EmailClient);
    const { data, error } = await client.emails.send(
      {
        from,
        to: args.to,
        subject: args.rendered.subject,
        html: args.rendered.html,
        text: args.rendered.text,
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
    );
    if (error) return { ok: false, code: error.name ?? "send_failed" };
    return { ok: true, providerMessageId: data?.id ?? null };
  } catch {
    return { ok: false, code: "send_failed" };
  }
}
