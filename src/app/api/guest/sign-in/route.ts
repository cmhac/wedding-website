import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { withMinimumDuration } from "@/lib/sign-in-timing";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { errorResponse, validationError } from "@/lib/api-errors";
import { signInRequestSchema } from "@/lib/guest-api/schemas";
import { readJson } from "@/lib/guest-api/request";
import { generateHouseholdTokenHash } from "@/lib/auth/household-session";
import { addressHash, allowSignInAttempt } from "@/lib/auth/sign-in-limits";
import { renderTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

// The per-IP limiter in front. The per-address and overall limits are durable
// and live in the database (research R12).
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
// Every valid request takes at least this long, so the response time does not
// reveal whether the address is known.
const MIN_RESPONSE_MS = 1500;

const NEUTRAL = {
  message: "If that address is on the guest list, a link is on its way.",
};

/**
 * Emails a sign-in link to the address typed, when it is one of a household's
 * addresses (research R5). The site sends it, not Supabase, so the link goes to
 * the typed address whichever of the household's addresses it is. Every outcome
 * other than "sent" is only logged, as a code with no address.
 */
async function sendLink(typed: string): Promise<string> {
  const admin = createAdminSupabase();

  const allowed = await allowSignInAttempt(admin, addressHash(typed));
  if (!allowed) return "limited";

  const contact = await admin
    .from("household_contacts")
    .select("household_id")
    .eq("kind", "email")
    .eq("value", typed.trim().toLowerCase())
    .maybeSingle();
  if (contact.error) return "lookup_failed";
  if (!contact.data) return "unknown";

  const tokenHash = await generateHouseholdTokenHash(contact.data.household_id);
  if (!tokenHash) return "no_token";

  const signInUrl = new URL("/auth/confirm", process.env.NEXT_PUBLIC_SITE_URL);
  signInUrl.searchParams.set("token_hash", tokenHash);
  signInUrl.searchParams.set("type", "email");

  let rendered;
  try {
    rendered = await renderTemplate("magic_link", {
      sign_in_url: signInUrl.toString(),
      audience: "guest",
    });
  } catch (e) {
    return (e as { code?: string })?.code === "template_missing"
      ? "template_missing"
      : "template_failed";
  }

  const sent = await sendEmail({ to: typed, rendered });
  return sent.ok ? "sent" : "send_failed";
}

export async function POST(request: Request) {
  if (!limiter.check(clientIp(request.headers))) {
    return errorResponse(
      429,
      "rate_limited",
      "Too many attempts. Try again soon.",
    );
  }

  const parsed = signInRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  await withMinimumDuration(MIN_RESPONSE_MS, async () => {
    let outcome: string;
    try {
      outcome = await sendLink(parsed.data.email);
    } catch {
      outcome = "exception";
    }
    // Same answer whatever happened, so the response never reveals who is on
    // the guest list. The log holds the outcome code only.
    if (outcome === "sent") log.info("guest_sign_in", { outcome });
    else log.warn("guest_sign_in", { outcome });
  });
  return Response.json(NEUTRAL, { status: 202 });
}
