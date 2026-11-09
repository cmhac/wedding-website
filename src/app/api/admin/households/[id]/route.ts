import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import {
  householdSchema,
  updateHouseholdRequestSchema,
} from "@/lib/admin-api/schemas";
import { deleteHouseholdWithAccess } from "@/lib/guests/household-access";
import type { Session } from "@/lib/auth/session";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.guid();
const notFound = () => errorResponse(404, "not_found", "Household not found.");

async function guard(): Promise<{ session: Session } | { denied: Response }> {
  try {
    return { session: await requireStaff() };
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return { denied };
    throw e;
  }
}

/** PATCH /api/admin/households/[id]: change the household's own fields (addresses have their own routes). */
export async function PATCH(request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;
  const staff = guarded.session.supabase;

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

  // Staff may update these columns directly; their own session keeps the audit trail theirs.
  // Only the id comes back from the write: the staff-only columns cannot be read from the table.
  const written = await staff
    .from("households")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .single();
  if (written.error || !written.data) {
    if (written.error?.code === "PGRST116") return notFound();
    log.error("household_update_failed", { code: "update" });
    return errorResponse(500, "server_error", "The household was not updated.");
  }
  const saved = await staff.rpc("staff_households").eq("id", id).single();
  const contacts = await staff
    .from("household_contacts")
    .select("id", { count: "exact", head: true })
    .eq("household_id", id);
  if (saved.error || !saved.data || contacts.error) {
    log.error("household_update_failed", { code: "read_back" });
    return errorResponse(500, "server_error", "The household was not updated.");
  }
  const count = contacts.count ?? 0;
  return Response.json({
    household: householdSchema.parse({
      ...(saved.data as Record<string, unknown>),
      contact_count: count,
      paper_only: count === 0,
    }),
  });
}

/** DELETE /api/admin/households/[id]: the household, its guests, and its sign-in account. */
export async function DELETE(_request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;
  const staff = guarded.session.supabase;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const result = await deleteHouseholdWithAccess(
    createAdminSupabase(),
    staff,
    id,
  );
  if (!result.ok) {
    if (result.code === "not_found") return notFound();
    log.error("household_delete_failed", { code: result.code });
    return errorResponse(500, "server_error", "The household was not deleted.");
  }
  return new Response(null, { status: 204 });
}
