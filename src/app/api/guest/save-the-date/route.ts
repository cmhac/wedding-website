import { authErrorResponse, requireSignedIn } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { loadSaveTheDate } from "@/lib/calendar/load";

/**
 * GET: the save the date card's facts and the calendar choices, for a signed-in
 * guest or staff member (contracts/guest-api.md). Nothing about any household,
 * and no personal link.
 */
export async function GET() {
  try {
    const session = await requireSignedIn();
    const details = await loadSaveTheDate(session.supabase);
    if (!details) {
      return errorResponse(500, "server_error", "Something went wrong.");
    }
    return Response.json(details, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return (
      authErrorResponse(e) ??
      errorResponse(500, "server_error", "Something went wrong.")
    );
  }
}
