import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Asks Supabase to email a staff sign-in link to the address typed. Shared by the
 * staff sign-in page and the home page's one sign-in prompt, so there is one
 * place that decides how a staff link is requested.
 *
 * `shouldCreateUser: false` means Supabase sends only when a staff Auth user
 * already exists (staff accounts are made by `scripts/create-staff-user.ts`),
 * so asking for an unknown address does nothing. The email itself goes out
 * through the Send Email hook, which recognizes the `audience=staff` redirect.
 *
 * Returns an outcome code and never throws. The code is for logs only: callers
 * answer the same way whatever it is, so nothing reveals who is staff.
 */
export async function requestStaffLink(
  supabase: SupabaseClient,
  address: string,
): Promise<string> {
  const email = address.trim();
  // A household's internal sign-in account is never mailed, and nobody should
  // be able to ask for a link to it by typing its address.
  const domain = (
    process.env.HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN || "households.invalid"
  ).toLowerCase();
  if (email.toLowerCase().endsWith(`@${domain}`)) return "household_account";

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?audience=staff`,
      },
    });
    if (!error) return "requested";
    return typeof error.code === "string" ? error.code : "unknown";
  } catch {
    return "exception";
  }
}
