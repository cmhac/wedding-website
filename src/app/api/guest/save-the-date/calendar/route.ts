import { authErrorResponse, requireSignedIn } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { buildIcs } from "@/lib/calendar/ics";
import { entryFor } from "@/lib/calendar/details";
import { loadSaveTheDate } from "@/lib/calendar/load";

/**
 * GET: the save the date as a calendar file (contracts/calendar.md), for a
 * signed-in guest or staff member. 409 `not_ready` while the wedding date is
 * not set: a wrong date is never produced.
 */
export async function GET() {
  try {
    const session = await requireSignedIn();
    const details = await loadSaveTheDate(session.supabase);
    if (!details) {
      return errorResponse(500, "server_error", "Something went wrong.");
    }
    const entry = entryFor(details, process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (!entry) {
      return errorResponse(409, "not_ready", "The date is not set yet.");
    }
    return new Response(buildIcs(entry), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="save-the-date.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return (
      authErrorResponse(e) ??
      errorResponse(500, "server_error", "Something went wrong.")
    );
  }
}
