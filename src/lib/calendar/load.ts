import { callRpc } from "@/lib/guest-api/request";
import { shapeSaveTheDate, type SaveTheDate } from "./details";

/**
 * Reads the save the date details with the caller's own client (a guest or a
 * staff member) through the `get_save_the_date` database function, and shapes
 * them. Null when the database call fails, so callers can answer plainly.
 */
export async function loadSaveTheDate(
  supabase: unknown,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL ?? "",
): Promise<SaveTheDate | null> {
  const { data, error } = await callRpc(supabase, "get_save_the_date");
  if (error) return null;
  return shapeSaveTheDate(data, siteUrl);
}
