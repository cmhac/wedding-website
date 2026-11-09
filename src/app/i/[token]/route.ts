import { createHouseholdSession } from "@/lib/auth/household-session";
import { householdIdFromToken, parseInviteToken } from "@/lib/auth/invite-link";
import {
  FAILURE_PATH,
  allowedNext,
  guestPath,
  redirectTo,
} from "@/lib/auth/redirect";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ token: string }> };

function fail(outcome: string) {
  log.warn("invite_link_failed", { outcome });
  return redirectTo(FAILURE_PATH);
}

/**
 * GET /i/[token]: opens a household's personal invite link (research R3, R4).
 * Checks the token (shape, then the signature for the household's current link
 * version), that the household has a sign-in account and that links are still
 * open (they close on the wedding day), signs the household in, and redirects
 * to the RSVP. The link is not used up: every open creates its own session, so
 * it works on any number of devices. Every failure looks the same (a redirect
 * to the failure path with no detail), and nothing here logs more than an
 * outcome code.
 */
export async function GET(request: Request, { params }: Context) {
  try {
    const { token } = await params;
    const householdId = householdIdFromToken(token);
    if (!householdId) return fail("malformed");

    const admin = createAdminSupabase();
    const household = await admin
      .from("households")
      .select("auth_user_id, invite_link_version")
      .eq("id", householdId)
      .maybeSingle();
    if (household.error || !household.data) return fail("unknown_household");
    if (!household.data.auth_user_id) return fail("no_account");

    if (!parseInviteToken(token, household.data.invite_link_version)) {
      return fail("bad_token");
    }

    const open = await admin.rpc("invite_links_open");
    if (open.error) return fail("closed_check_failed");
    if (open.data !== true) return fail("links_closed");

    const session = await createHouseholdSession(householdId);
    if (!session.ok) return fail("session_failed");

    log.info("invite_link_opened", { outcome: "signed_in" });
    const next = allowedNext(
      new URL(request.url).searchParams.get("next"),
      "guest",
    );
    return redirectTo(next ?? guestPath());
  } catch {
    return fail("error");
  }
}
