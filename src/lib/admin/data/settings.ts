import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { isoToPacificLocal } from "../time";

export type SettingsRow = {
  id: boolean;
  default_rsvp_deadline: string | null;
  rsvp_open: boolean;
  [column: string]: unknown;
};

export type SettingsData = {
  /** A Pacific `datetime-local` value, or "" when no default is set. */
  default_rsvp_deadline: string;
  rsvp_open: boolean;
  row: SettingsRow;
};

/** One person in the staff list. Names only; emails live in the auth system. */
export type StaffRow = {
  user_id: string;
  display_name: string;
  role: StaffRole;
};

async function clientOr(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? ((await createServerSupabase()) as SupabaseClient);
}

/** The single settings row, shaped for the settings form. Throws if unreadable. */
export async function loadSettings(
  supabase?: SupabaseClient,
): Promise<SettingsData> {
  const client = await clientOr(supabase);
  const { data, error } = await client.from("settings").select("*").single();
  if (error || !data) throw new Error("settings_unreadable");
  const row = data as SettingsRow;
  return {
    default_rsvp_deadline: isoToPacificLocal(row.default_rsvp_deadline),
    rsvp_open: Boolean(row.rsvp_open),
    row,
  };
}

/** Everyone with staff access: the couple first, then by name. Throws if unreadable. */
export async function loadStaff(
  supabase?: SupabaseClient,
): Promise<StaffRow[]> {
  const client = await clientOr(supabase);
  const { data, error } = await client
    .from("staff")
    .select("user_id, display_name, role");
  if (error || !data) throw new Error("staff_unreadable");
  return (data as StaffRow[])
    .map(({ user_id, display_name, role }) => ({ user_id, display_name, role }))
    .sort(
      (a, b) =>
        Number(b.role === "couple") - Number(a.role === "couple") ||
        a.display_name.localeCompare(b.display_name),
    );
}
