import { z } from "zod";
import { createRateLimiter } from "@/lib/rate-limit";
import { createServerSupabase } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { errorResponse, validationError } from "@/lib/api-errors";

const bodySchema = z.object({ email: z.email().max(320) });

// Staff Auth users exist only because scripts/create-staff-user.ts created
// them, so the link is requested with shouldCreateUser: false.
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

const NEUTRAL = {
  message: "If that address belongs to a staff account, a link is on its way.",
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!limiter.check(ip || "unknown")) {
    return errorResponse(
      429,
      "rate_limited",
      "Too many attempts. Try again soon.",
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = undefined;
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    // Same answer for a known address, an unknown address, and an error,
    // so the response never reveals who has an account.
    if (error) {
      log.warn("admin_sign_in_failed", {
        code: typeof error.code === "string" ? error.code : "unknown",
      });
    }
  } catch {
    log.warn("admin_sign_in_failed", { code: "exception" });
  }
  return Response.json(NEUTRAL, { status: 202 });
}
