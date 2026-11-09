import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * A single-use sign-in token for the household's Auth user (`generateLink`
 * sends nothing), or null on any failure. The token hash goes to `verifyOtp`
 * now (a personal link) or into an emailed `/auth/confirm` link (a typed
 * address). Never log it.
 */
export async function generateHouseholdTokenHash(
  householdId: string,
): Promise<string | null> {
  try {
    const admin = createAdminSupabase();

    const household = await admin
      .from("households")
      .select("auth_user_id")
      .eq("id", householdId)
      .maybeSingle();
    const authUserId = household.data?.auth_user_id;
    if (household.error || !authUserId) return null;

    const user = await admin.auth.admin.getUserById(authUserId);
    const email = user.data?.user?.email;
    if (user.error || !email) return null;

    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) return null;
    return tokenHash;
  } catch {
    return null;
  }
}

/**
 * Signs the caller in as a household: asks for a single-use token for the
 * household's Auth user and exchanges it for a session with the cookie-aware
 * server client, so the session cookies are set on the response. Shared by the
 * personal-link route (research R1 and R4).
 *
 * Any failure gives `{ ok: false }` with no detail: callers send the visitor
 * to the one failure path, and nothing here logs an address or a token.
 */
export async function createHouseholdSession(
  householdId: string,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const tokenHash = await generateHouseholdTokenHash(householdId);
    if (!tokenHash) return { ok: false };

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
