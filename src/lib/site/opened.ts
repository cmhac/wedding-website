import { callRpc } from "@/lib/guest-api/request";
import type { Session } from "@/lib/auth/session";

/**
 * Records that a signed-in guest's device loaded a site page, so the couple can
 * follow up with households that have not (the database keeps only the first
 * time). Staff previews never count, and a failure never breaks the page.
 */
export async function recordHouseholdOpened(session: Session): Promise<void> {
  if (session.kind !== "guest") return;
  try {
    await callRpc(session.supabase, "record_household_opened");
  } catch {
    // Recording an open never breaks the page.
  }
}
