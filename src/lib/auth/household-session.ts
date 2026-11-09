import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Signs the caller in as a household: finds the household's Auth user with the
 * service-role client, asks Supabase for a single-use sign-in token for it
 * (`generateLink` sends nothing), and exchanges the token for a session with
 * the cookie-aware server client, so the session cookies are set on the
 * response. Shared by the personal-link route and the typed-address route
 * (research R1 and R4).
 *
 * Any failure gives `{ ok: false }` with no detail: callers send the visitor
 * to the one failure path, and nothing here logs an address or a token.
 */
export async function createHouseholdSession(
  householdId: string,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createAdminSupabase();

    const household = await admin
      .from("households")
      .select("auth_user_id")
      .eq("id", householdId)
      .maybeSingle();
    const authUserId = household.data?.auth_user_id;
    if (household.error || !authUserId) return { ok: false };

    const user = await admin.auth.admin.getUserById(authUserId);
    const email = user.data?.user?.email;
    if (user.error || !email) return { ok: false };

    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) return { ok: false };

    const supabase = await createServerSupabase();
    const verified = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (verified.error || !verified.data.session) return { ok: false };

    return { ok: true };
  } catch {
    return { ok: false };
  }
}
