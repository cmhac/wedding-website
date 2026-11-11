import { createHouseholdSession } from "@/lib/auth/household-session";
import {
  householdIdFromTimedToken,
  parseTimedToken,
} from "@/lib/auth/timed-link";
import { FAILURE_PATH, guestPath, redirectTo } from "@/lib/auth/redirect";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ token: string }> };

function fail(outcome: string) {
  log.warn("timed_link_failed", { outcome });
  return redirectTo(FAILURE_PATH);
}

/**
 * GET /t/[token]: the sign-in link texted to a guest who typed their number
 * (contracts/guest-api.md). Valid for 15 minutes and reusable in that window,
 * so a messaging app that opens it first does not use it up. Unlike the personal
 * link it does not stop on the wedding day, as a typed sign-in does not. Every
 * failure is the same redirect with no detail, and nothing here logs more than
 * an outcome code.
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { token } = await params;
    const householdId = householdIdFromTimedToken(token);
    if (!householdId) return fail("malformed");

    const household = await createAdminSupabase()
      .from("households")
      .select("auth_user_id, invite_link_version")
      .eq("id", householdId)
      .maybeSingle();
    if (household.error || !household.data) return fail("unknown_household");
    if (!household.data.auth_user_id) return fail("no_account");

    if (!parseTimedToken(token, household.data.invite_link_version)) {
      return fail("bad_token");
    }

    const session = await createHouseholdSession(householdId);
    if (!session.ok) return fail("session_failed");

    log.info("timed_link_opened", { outcome: "signed_in" });
    return redirectTo(guestPath());
  } catch {
    return fail("error");
  }
}
