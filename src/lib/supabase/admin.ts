import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses row-level security. This is the only file that
 * reads SUPABASE_SERVICE_ROLE_KEY; import it only from route handlers and scripts.
 */
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
