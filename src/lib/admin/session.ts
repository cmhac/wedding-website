import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getSession, type Session, type StaffRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const ADMIN_SIGN_IN_PATH = "/admin/sign-in";

export type StaffPageSession = {
  user: User;
  role: StaffRole;
  supabase: SupabaseClient;
};

/** Returned (not thrown) when the person is signed in but not allowed. */
export type Forbidden = { forbidden: true };

export function isForbidden(
  result: StaffPageSession | Forbidden,
): result is Forbidden {
  return "forbidden" in result;
}

/**
 * For pages and server actions. Redirects to the admin sign-in page when
 * nobody is signed in; returns `{ forbidden: true }` for a guest. Staff
 * status is read on every call and never cached.
 */
export async function requireStaffPage(
  supabase?: SupabaseClient,
): Promise<StaffPageSession | Forbidden> {
  const session: Session | null = await getSession(supabase);
  if (!session) redirect(ADMIN_SIGN_IN_PATH);
  if (session.kind !== "staff" || !session.role) return { forbidden: true };
  return { user: session.user, role: session.role, supabase: session.supabase };
}

/** As `requireStaffPage`, but only couple members pass. */
export async function requireCouplePage(
  supabase?: SupabaseClient,
): Promise<StaffPageSession | Forbidden> {
  const result = await requireStaffPage(supabase);
  if (isForbidden(result) || result.role !== "couple") {
    return { forbidden: true };
  }
  return result;
}

/** What the console shell shows about the signed-in person, or null. */
export async function getShellStaff(
  supabase?: SupabaseClient,
): Promise<{ displayName: string; role: StaffRole } | null> {
  const client = supabase ?? ((await createServerSupabase()) as SupabaseClient);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const staff = await client
    .from("staff")
    .select("display_name, role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!staff.data) return null;
  return {
    displayName: staff.data.display_name as string,
    role: staff.data.role as StaffRole,
  };
}
