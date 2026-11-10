import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Ends this device's session only. Supabase's default scope ends every session
 * of the user, and a household is one shared user, so "global" would sign the
 * whole household out on every device.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Signing out never fails from the caller's point of view.
  }
  return new Response(null, { status: 204 });
}
