import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import {
  consentCountsBody,
  consentFailure,
  singleConsentRequestSchema,
} from "@/lib/admin-api/consent-routes";
import { log } from "@/lib/log";
import { setSmsConsent } from "@/lib/sms/consent-marks";

type Context = { params: Promise<{ id: string; cid: string }> };

const idSchema = z.guid();

/**
 * POST: mark or clear text consent for one number (contracts/admin-api.md).
 * A number that declined needs `override_declined`. Staff only. Sends no text.
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const session = await requireStaff();
    const { id, cid } = await params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(cid).success) {
      return errorResponse(404, "not_found", "Household or number not found.");
    }
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      json = undefined;
    }
    const parsed = singleConsentRequestSchema.safeParse(json);
    if (!parsed.success) return validationError(parsed.error);
    const result = await setSmsConsent(session.supabase, {
      householdIds: [id],
      contactId: cid,
      mode: parsed.data.mode,
      overrideDeclined: parsed.data.override_declined,
      note: parsed.data.note,
    });
    if (!result.ok) {
      if (result.code === "failed") log.error("phone_consent_failed", {});
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
