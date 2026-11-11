import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { phoneFailure, phoneRequestSchema } from "@/lib/admin-api/phone-routes";
import { log } from "@/lib/log";
import { addPhone } from "@/lib/sms/phones";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.guid();

/**
 * POST /api/admin/households/[id]/phones: add a United States phone number. It
 * is validated here and written by a service-role function; the new number's
 * opt-in is "not asked", and staff can never set it (contracts/admin-api.md).
 */
export async function POST(request: Request, { params }: Context) {
  try {
    await requireStaff();
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return errorResponse(404, "not_found", "Household not found.");
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = undefined;
  }
  const parsed = phoneRequestSchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  const result = await addPhone(createAdminSupabase(), id, parsed.data.value);
  if (!result.ok) {
    if (result.code === "failed")
      log.error("household_phone_add_failed", { code: result.code });
    return phoneFailure(result.code);
  }
  return Response.json(
    {
      contact: {
        id: result.contactId,
        kind: "phone",
        value: result.e164,
        sms_consent: "not_asked",
      },
    },
    { status: 201 },
  );
}
