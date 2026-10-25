import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { linkHouseholdAccounts } from "@/lib/guests/household-access";
import { runGuestImport } from "@/lib/guests/run-import";
import { SpreadsheetError, xlsxToCsv } from "@/lib/guests/spreadsheet";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

const MAX_BYTES = 2 * 1024 * 1024;
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SPREADSHEET_MESSAGES = {
  unreadable: "This file could not be read. Upload a .csv or .xlsx file.",
  empty: "The file is empty.",
  too_many_rows: "The file has too many rows.",
} as const;

type Source =
  | { format: "csv" }
  | {
      format: "xlsx";
      sheet: { name: string; index: number; count: number };
    };

/**
 * POST /api/admin/guests/import: the request body is the CSV text, or the raw
 * bytes of an .xlsx file when the Content-Type is the spreadsheet type (the
 * first sheet is converted to the same CSV; any other type is CSV). Runs as the
 * signed-in staff member so the import is attributed to them; the sign-in
 * accounts for the new households are then created with the service-role key
 * and linked through the staff member's session.
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

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return errorResponse(422, "invalid_file", "The file is too large.");
  }

  let csv: string;
  let source: Source = { format: "csv" };
  let rowOffset = 0;
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (type.split(";")[0].trim() === XLSX_TYPE) {
    try {
      const converted = await xlsxToCsv(bytes);
      csv = converted.csv;
      rowOffset = converted.rowOffset;
      source = { format: "xlsx", sheet: converted.sheet };
    } catch (e) {
      if (e instanceof SpreadsheetError) {
        return errorResponse(
          422,
          "invalid_file",
          SPREADSHEET_MESSAGES[e.reason],
        );
      }
      log.error("guest_import_failed", { code: "spreadsheet" });
      return errorResponse(
        500,
        "server_error",
        "The import could not be completed.",
      );
    }
  } else {
    csv = new TextDecoder().decode(bytes);
    if (csv.trim() === "") {
      return errorResponse(422, "invalid_file", "The file is empty.");
    }
  }
  // Rows are counted from the header; blank sheet rows above it shift them.
  const sheetRow = (row: number) => row + rowOffset;

  try {
    const result = await runGuestImport(session.supabase, csv);
    if (result.kind === "invalid") {
      return errorResponse(
        422,
        "invalid_file",
        "The file could not be read.",
        result.errors.map((e) => ({
          path: [sheetRow(e.row), e.field],
          message: e.message,
        })),
      );
    }
    if (result.created.households > 0) {
      const link = await linkHouseholdAccounts(
        createAdminSupabase(),
        result.householdIds,
        { staff: session.supabase },
      );
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
    return Response.json({
      created: result.created,
      errors: result.errors.map((e) => ({ ...e, row: sheetRow(e.row) })),
      source,
    });
  } catch {
    log.error("guest_import_failed", { code: "import" });
    return errorResponse(
      500,
      "server_error",
      "The import could not be completed.",
    );
  }
}
