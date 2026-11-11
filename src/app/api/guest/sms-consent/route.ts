import { authErrorResponse, requireGuest } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { smsConsentRequestSchema } from "@/lib/guest-api/schemas";
import { readJson } from "@/lib/guest-api/request";
import { answerConsent, getConsentPrompt } from "@/lib/sms/consent";

/**
 * GET: the numbers still to ask about (nothing while texting is not available).
 * POST: the guest's answers from the consent step (contracts/guest-api.md).
 */
export async function GET() {
  try {
    const session = await requireGuest();
    return Response.json(await getConsentPrompt(session.supabase));
  } catch (e) {
    return (
      authErrorResponse(e) ??
      errorResponse(500, "server_error", "Something went wrong.")
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireGuest();
    const parsed = smsConsentRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const result = await answerConsent(session.supabase, parsed.data.answers);
    if (!result.ok) {
      return result.code === "texting_unavailable"
        ? errorResponse(409, "texting_unavailable", "Texting is not available.")
        : errorResponse(500, "server_error", "Something went wrong.");
    }
    return Response.json({ saved: result.saved });
  } catch (e) {
    return (
      authErrorResponse(e) ??
      errorResponse(500, "server_error", "Something went wrong.")
    );
  }
}
