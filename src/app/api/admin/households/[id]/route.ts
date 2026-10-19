import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import {
  householdSchema,
  updateHouseholdRequestSchema,
} from "@/lib/admin-api/schemas";
import {
  deleteHouseholdWithAccess,
  updateHouseholdContactEmail,
} from "@/lib/guests/household-access";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.uuid();
const notFound = () => errorResponse(404, "not_found", "Household not found.");

async function guard(): Promise<Response | null> {
  try {
    await requireStaff();
    return null;
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    throw e;
  }
}

function emailInUse() {
  return errorResponse(
    409,
    "email_in_use",
    "That email address is already used by another household. Use a different address.",
  );
}

/** PATCH /api/admin/households/[id]: change the contact email and other fields. */
export async function PATCH(request: Request, { params }: Context) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = undefined;
  }
  const parsed = updateHouseholdRequestSchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  const admin = createAdminSupabase();
  const { contact_email, ...others } = parsed.data;

  let household: Record<string, unknown> | null = null;
  if (contact_email !== undefined) {
    const result = await updateHouseholdContactEmail(admin, id, contact_email);
    if (!result.ok) {
      if (result.code === "email_in_use") return emailInUse();
      if (result.code === "not_found") return notFound();
      log.error("household_update_failed", { code: result.code });
      return errorResponse(
        500,
        "server_error",
        "The household was not updated.",
      );
    }
    household = result.household;
  }

  if (Object.keys(others).length > 0) {
    const saved = await admin
      .from("households")
      .update(others)
      .eq("id", id)
      .select("*")
      .single();
    if (saved.error || !saved.data) {
      if (saved.error?.code === "PGRST116") return notFound();
      log.error("household_update_failed", { code: "update" });
      return errorResponse(
        500,
        "server_error",
        "The household was not updated.",
      );
    }
    household = {
      ...saved.data,
      paper_only: saved.data.contact_email === null,
    };
  }

  return Response.json({ household: householdSchema.parse(household) });
}

/** DELETE /api/admin/households/[id]: the household, its guests, and its sign-in account. */
export async function DELETE(_request: Request, { params }: Context) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const result = await deleteHouseholdWithAccess(createAdminSupabase(), id);
  if (!result.ok) {
    if (result.code === "not_found") return notFound();
    log.error("household_delete_failed", { code: result.code });
    return errorResponse(500, "server_error", "The household was not deleted.");
  }
  return new Response(null, { status: 204 });
}
