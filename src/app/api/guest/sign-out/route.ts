import { createServerSupabase } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {
    // Signing out never fails from the caller's point of view.
  }
  return new Response(null, { status: 204 });
}
