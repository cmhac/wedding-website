"use server";

import { redirect } from "next/navigation";
import { ADMIN_SIGN_IN_PATH } from "@/lib/admin/session";
import { log } from "@/lib/log";
import { createServerSupabase } from "@/lib/supabase/server";

/** Ends the session and goes to the admin sign-in page, signed in or not. */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {
    log.warn("admin_sign_out_failed", { code: "server_error" });
  }
  redirect(ADMIN_SIGN_IN_PATH);
}
