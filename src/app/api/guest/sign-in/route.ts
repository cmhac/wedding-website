import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { withMinimumDuration } from "@/lib/sign-in-timing";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { requestStaffLink } from "@/lib/auth/staff-sign-in";
import { log } from "@/lib/log";
import { errorResponse, validationError } from "@/lib/api-errors";
import { signInRequestSchema } from "@/lib/guest-api/schemas";
import { readJson } from "@/lib/guest-api/request";
import { generateHouseholdTokenHash } from "@/lib/auth/household-session";
import { timedLinkUrl } from "@/lib/auth/timed-link";
import { addressHash, allowSignInAttempt } from "@/lib/auth/sign-in-limits";
import { renderTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { sendConfirmationText } from "@/lib/sms/consent";
import { parseUsPhone } from "@/lib/sms/phone";
import { sendText } from "@/lib/sms/send";
import { getSmsState, type SmsState } from "@/lib/sms/state";
import { renderText } from "@/lib/sms/texts";
import { statusCallbackUrl } from "@/lib/sms/urls";

// The per-IP limiter in front. The per-address and overall limits are durable
// and live in the database (research R12).
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
// Every valid request takes at least this long, so the response time does not
// reveal whether the address is known.
const MIN_RESPONSE_MS = 1500;

// One answer whatever happened. While texting is not available the answer is
// the original email-only wording, so nothing about texting shows; once it is
// available the wording covers both kinds, so it never shows which was typed.
const NEUTRAL_EMAIL = {
  message:
    "If that address is on the guest list or belongs to a staff account, a link is on its way.",
};
const NEUTRAL_BOTH = {
  message:
    "If that email address or mobile number is on the guest list, or belongs to a staff account, a link is on its way.",
};

const UNAVAILABLE: SmsState = {
  configured: false,
  enabled: false,
  available: false,
};

/**
 * Emails a sign-in link to the address typed. A household address gets the
 * household link: the site sends it, not Supabase, so it goes to the typed
 * address whichever of the household's addresses it is (research R5). Any other
 * address is tried as a staff address: Supabase sends the staff link only when
 * a staff account exists. Staff addresses are never household addresses
 * (decision 0012), so the order cannot change who gets what. Every outcome
 * other than "sent" and "staff_requested" is only logged, as a code with no
 * address.
 */
async function sendEmailLink(typed: string): Promise<string> {
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
  if (!contact.data) {
    // The server client, so the one-time-link verifier cookie is set on this
    // response, as when staff sign in from the admin page.
    const outcome = await requestStaffLink(await createServerSupabase(), typed);
    return outcome === "requested" ? "staff_requested" : "unknown";
  }

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

/**
 * A typed phone number, only while texting is available and the box was
 * ticked. Applies the sign-in limits first (keyed on the hash of the number),
 * then looks the number up: a known number has its opt-in recorded, gets a
 * confirmation text if that is new, and then the timed sign-in link. Nothing is
 * sent or recorded for any other case. Outcomes are codes only.
 */
async function sendPhoneLink(
  typed: string,
  consent: boolean,
  state: SmsState,
): Promise<string> {
  if (!state.available) return "sms_unavailable";
  if (!consent) return "no_consent";
  const phone = parseUsPhone(typed);
  if (!phone.ok) return phone.reason === "not_us" ? "not_us" : "invalid_phone";

  const admin = createAdminSupabase();
  const allowed = await allowSignInAttempt(admin, addressHash(phone.e164));
  if (!allowed) return "limited";

  const found = await admin.rpc("find_phone_contact", { value: phone.e164 });
  if (found.error) return "lookup_failed";
  const household = (found.data as { household_id?: string } | null)
    ?.household_id;
  if (!household) return "unknown";

  const recorded = await admin.rpc("record_sms_consent_for_number", {
    household_id: household,
    value: phone.e164,
  });
  if (recorded.error) return "consent_failed";
  if ((recorded.data as { newly_opted_in?: boolean } | null)?.newly_opted_in) {
    // A failed confirmation never undoes the recorded opt-in or stops the link.
    await sendConfirmationText(phone.e164);
  }

  const version = await admin
    .from("households")
    .select("invite_link_version")
    .eq("id", household)
    .maybeSingle();
  const linkVersion = (version.data as { invite_link_version?: number } | null)
    ?.invite_link_version;
  if (version.error || typeof linkVersion !== "number") return "no_household";

  let body: string;
  try {
    body = renderText("sms_sign_in", {
      sign_in_url: timedLinkUrl(household, linkVersion),
    });
  } catch (e) {
    return (e as { code?: string })?.code === "template_missing"
      ? "template_missing"
      : "template_failed";
  }

  const sent = await sendText({
    to: phone.e164,
    body,
    statusCallback: statusCallbackUrl(),
  });
  return sent.ok ? "sms_sent" : "sms_send_failed";
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
  const typed = (parsed.data.identifier ?? parsed.data.email) as string;
  const consent = parsed.data.sms_consent === true;

  let state = UNAVAILABLE;
  try {
    state = await getSmsState();
  } catch {
    state = UNAVAILABLE;
  }

  await withMinimumDuration(MIN_RESPONSE_MS, async () => {
    let outcome: string;
    try {
      outcome = typed.includes("@")
        ? await sendEmailLink(typed)
        : await sendPhoneLink(typed, consent, state);
    } catch {
      outcome = "exception";
    }
    // Same answer whatever happened, so the response never reveals who is on
    // the guest list. The log holds the outcome code only.
    if (
      outcome === "sent" ||
      outcome === "staff_requested" ||
      outcome === "sms_sent"
    ) {
      log.info("guest_sign_in", { outcome });
    } else log.warn("guest_sign_in", { outcome });
  });
  return Response.json(state.available ? NEUTRAL_BOTH : NEUTRAL_EMAIL, {
    status: 202,
  });
}
