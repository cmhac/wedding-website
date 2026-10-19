import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { linkPendingHouseholdAccounts } from "@/lib/guests/household-access";
import { runGuestImport } from "@/lib/guests/run-import";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/admin/guests/import: the request body is the CSV text. Runs as the
 * signed-in staff member so the import is attributed to them; the sign-in
 * accounts for the new households are then created with the service-role key.
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireStaff();
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  const csv = await request.text();
  if (csv.trim() === "") {
    return errorResponse(422, "invalid_file", "The file is empty.");
  }
  if (Buffer.byteLength(csv) > MAX_BYTES) {
    return errorResponse(422, "invalid_file", "The file is too large.");
  }

  try {
    const result = await runGuestImport(session.supabase, csv);
    if (result.kind === "invalid") {
      return errorResponse(
        422,
        "invalid_file",
        "The file could not be read.",
        result.errors.map((e) => ({
          path: [e.row, e.field],
          message: e.message,
        })),
      );
    }
    if (result.created.households > 0) {
      const link = await linkPendingHouseholdAccounts(createAdminSupabase());
      log.info("guest_import_accounts_linked", {
        linked: link.linked,
        failed: link.failed,
      });
    }
    log.info("guest_import_done", {
      households: result.created.households,
      guests: result.created.guests,
      invitations: result.created.invitations,
      errors: result.errors.length,
    });
    return Response.json({ created: result.created, errors: result.errors });
  } catch {
    log.error("guest_import_failed", { code: "import" });
    return errorResponse(
      500,
      "server_error",
      "The import could not be completed.",
    );
  }
}
