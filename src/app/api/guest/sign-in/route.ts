import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { withMinimumDuration } from "@/lib/sign-in-timing";
import { createServerSupabase } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { errorResponse, validationError } from "@/lib/api-errors";
import { signInRequestSchema } from "@/lib/guest-api/schemas";
import { readJson } from "@/lib/guest-api/request";

// Guest Auth users are created by the guest-list import, never by sign-in, so
// the link is requested with shouldCreateUser: false (research R2).
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
// Per address (lower-cased), applied before Supabase is called. Best effort
// only: Supabase's own per-email limit is the real control (docs/manual-setup.md).
const emailLimiter = createRateLimiter({ limit: 3, windowMs: 600_000 });
// Every valid request takes at least this long, so the response time does not
// reveal whether the address is known.
const MIN_RESPONSE_MS = 1500;

const NEUTRAL = {
  message: "If that address is on the guest list, a link is on its way.",
};

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

  // A repeat request for the same address looks the same as any other: the
  // neutral answer, with no call to Supabase.
  if (!emailLimiter.check(parsed.data.email.toLowerCase())) {
    await withMinimumDuration(MIN_RESPONSE_MS, async () => {});
    return Response.json(NEUTRAL, { status: 202 });
  }

  await withMinimumDuration(MIN_RESPONSE_MS, async () => {
    try {
      const supabase = await createServerSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
        },
      });
      // Same answer for a known address, an unknown address, and an error, so
      // the response never reveals who is on the guest list.
      if (error) {
        log.warn("guest_sign_in_failed", {
          code: typeof error.code === "string" ? error.code : "unknown",
        });
      }
    } catch {
      log.warn("guest_sign_in_failed", { code: "exception" });
    }
  });
  return Response.json(NEUTRAL, { status: 202 });
}
