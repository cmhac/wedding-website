import { NextResponse } from "next/server";
import { z } from "zod";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/email/send";
import {
  getTemplate,
  renderTemplate,
  TemplateError,
} from "@/lib/email/templates";
import { HookVerificationError, verifyHook } from "@/lib/email/verify-hook";

/**
 * Supabase Auth "Send Email" hook. Verifies the Standard Webhooks signature over
 * the raw body, renders the registered `magic_link` template and sends it with
 * Resend. The response never reveals whether the address is a known guest.
 */

const payloadSchema = z.object({
  user: z.object({ email: z.string().min(1) }),
  email_data: z.object({
    token_hash: z.string().min(1),
    redirect_to: z.string().default(""),
    email_action_type: z.string().min(1),
  }),
});

function error(status: number, code: string) {
  return NextResponse.json({ error: { code, message: code } }, { status });
}

/**
 * Staff sign-in links are requested with the allow-listed redirect
 * `/auth/callback?audience=staff` (see the admin sign-in route); every other
 * redirect is a guest link.
 */
function audienceFor(redirectTo: string): "guest" | "staff" {
  try {
    const url = new URL(redirectTo);
    return url.pathname === "/auth/callback" &&
      url.searchParams.get("audience") === "staff"
      ? "staff"
      : "guest";
  } catch {
    return "guest";
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  let payload: unknown;
  try {
    payload = verifyHook(rawBody, request.headers);
  } catch (e) {
    if (e instanceof HookVerificationError) {
      log.warn("send_email_hook", { outcome: "bad_signature" });
      return new Response(null, { status: 401 });
    }
    throw e;
  }

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return error(400, "invalid_payload");
  const { user, email_data: data } = parsed.data;

  if (data.email_action_type !== "magiclink") {
    log.info("send_email_hook", { outcome: "ignored_action" });
    return NextResponse.json({});
  }

  try {
    getTemplate("magic_link");
  } catch {
    log.error("send_email_hook", { outcome: "template_missing" });
    return error(500, "template_missing");
  }

  const signInUrl = new URL(
    "/auth/v1/verify",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  signInUrl.searchParams.set("token", data.token_hash);
  signInUrl.searchParams.set("type", data.email_action_type);
  signInUrl.searchParams.set("redirect_to", data.redirect_to);

  let rendered;
  try {
    rendered = await renderTemplate("magic_link", {
      sign_in_url: signInUrl.toString(),
      audience: audienceFor(data.redirect_to),
    });
  } catch (e) {
    const code = e instanceof TemplateError ? e.code : "template_failed";
    log.error("send_email_hook", { outcome: code });
    return error(500, code);
  }

  const result = await sendEmail({ to: user.email, rendered });
  if (!result.ok) {
    log.error("send_email_hook", { outcome: "send_failed", code: result.code });
    return error(500, "send_failed");
  }
  log.info("send_email_hook", { outcome: "sent" });
  return NextResponse.json({});
}
