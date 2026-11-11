import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import {
  batchConsentRequestSchema,
  consentCountsBody,
  consentFailure,
} from "@/lib/admin-api/consent-routes";
import { log } from "@/lib/log";
import { setSmsConsent } from "@/lib/sms/consent-marks";

/**
 * POST: mark (or clear) text consent for every phone number of the chosen
 * households, all or nothing, with an optional dry run (contracts/admin-api.md).
 * Staff only. Sends no text.
 */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      json = undefined;
    }
    const parsed = batchConsentRequestSchema.safeParse(json);
    if (!parsed.success) return validationError(parsed.error);
    const result = await setSmsConsent(session.supabase, {
      householdIds: parsed.data.household_ids,
      mode: parsed.data.mode,
      overrideDeclined: parsed.data.override_declined,
      note: parsed.data.note,
      dryRun: parsed.data.dry_run,
    });
    if (!result.ok) {
      if (result.code === "failed") log.error("batch_consent_failed", {});
      return consentFailure(result.code);
    }
    return Response.json({ counts: consentCountsBody(result.counts) });
  } catch (e) {
    return (
      authErrorResponse(e) ??
      errorResponse(500, "server_error", "Something went wrong.")
    );
  }
}
