import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export type SessionKind = "staff" | "guest";
export type StaffRole = "couple" | "planner";

export type Session = {
  kind: SessionKind;
  user: User;
  /** Set only when kind is "staff". */
  role: StaffRole | null;
  supabase: SupabaseClient;
};

/**
 * Works out who is calling. Staff status is read from the `staff` table on
 * every call and never cached, so revocation applies on the next request.
 * A user who is both staff and a household responder is staff (the planner
 * may also be a guest).
 */
export async function getSession(
  supabase?: SupabaseClient,
): Promise<Session | null> {
  const client = supabase ?? ((await createServerSupabase()) as SupabaseClient);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;

  const staff = await client
    .from("staff")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (staff.data) {
    return {
      kind: "staff",
      user,
      role: staff.data.role as StaffRole,
      supabase: client,
    };
  }

  const household = await client
    .from("households")
    .select("id")
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (household.data) {
    return { kind: "guest", user, role: null, supabase: client };
  }
  return null;
}

export async function getSessionKind(
  supabase?: SupabaseClient,
): Promise<SessionKind | null> {
  return (await getSession(supabase))?.kind ?? null;
}
