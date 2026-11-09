import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { updateContactRequestSchema } from "@/lib/admin-api/schemas";
import { contactFailure } from "@/lib/admin-api/contact-routes";
import {
  removeHouseholdContact,
  updateHouseholdContact,
} from "@/lib/guests/household-access";
import type { Session } from "@/lib/auth/session";
import { log } from "@/lib/log";

type Context = { params: Promise<{ id: string; cid: string }> };

const idSchema = z.guid();
const notFound = () =>
  errorResponse(404, "not_found", "Household or address not found.");

async function guard(): Promise<{ session: Session } | { denied: Response }> {
  try {
    return { session: await requireStaff() };
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return { denied };
    throw e;
  }
}

/** PATCH /api/admin/households/[id]/contacts/[cid]: change an address (this clears its delivery flag). */
export async function PATCH(request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;

  const { id, cid } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(cid).success) {
    return notFound();
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = undefined;
  }
  const parsed = updateContactRequestSchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  const result = await updateHouseholdContact(
    guarded.session.supabase,
    id,
    cid,
    parsed.data.value,
  );
  if (!result.ok) {
    if (result.code === "failed") {
      log.error("household_contact_update_failed", { code: result.code });
    }
    return contactFailure(result.code);
  }
  return Response.json({
    contact: {
      id: cid,
      kind: "email",
      value: parsed.data.value.trim().toLowerCase(),
    },
  });
}

/** DELETE /api/admin/households/[id]/contacts/[cid]: remove an address; says paper_only when it was the last. */
export async function DELETE(_request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;

  const { id, cid } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(cid).success) {
    return notFound();
  }

  const result = await removeHouseholdContact(
    guarded.session.supabase,
    id,
    cid,
  );
  if (!result.ok) {
    if (result.code === "failed") {
      log.error("household_contact_remove_failed", { code: result.code });
    }
    return contactFailure(result.code);
  }
  return Response.json({ paper_only: result.paperOnly });
}
