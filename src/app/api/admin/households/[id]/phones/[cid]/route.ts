import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { phoneFailure, phoneRequestSchema } from "@/lib/admin-api/phone-routes";
import { log } from "@/lib/log";
import { changePhone, removePhone } from "@/lib/sms/phones";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string; cid: string }> };

const idSchema = z.guid();
const notFound = () =>
  errorResponse(404, "not_found", "Household or number not found.");

async function guard(): Promise<{ ok: true } | { denied: Response }> {
  try {
    await requireStaff();
    return { ok: true };
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return { denied };
    throw e;
  }
}

/** PATCH: change a number. The opt-in goes back to "not asked" (the new number has not agreed). */
export async function PATCH(request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;
  const { id, cid } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(cid).success)
    return notFound();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = undefined;
  }
  const parsed = phoneRequestSchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  const result = await changePhone(
    createAdminSupabase(),
    id,
    cid,
    parsed.data.value,
  );
  if (!result.ok) {
    if (result.code === "failed")
      log.error("household_phone_update_failed", { code: result.code });
    return phoneFailure(result.code);
  }
  return Response.json({
    contact: {
      id: cid,
      kind: "phone",
      value: result.e164,
      sms_consent: "not_asked",
    },
  });
}

/** DELETE: remove a number and its opt-in. Says whether the household is now paper only. */
export async function DELETE(_request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;
  const { id, cid } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(cid).success)
    return notFound();

  const result = await removePhone(createAdminSupabase(), id, cid);
  if (!result.ok) {
    if (result.code === "failed")
      log.error("household_phone_remove_failed", { code: result.code });
    return phoneFailure(result.code);
  }
  return Response.json({ paper_only: result.paperOnly });
}
