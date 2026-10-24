import { authErrorResponse, requireCouple } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { staffUserIdSchema } from "@/lib/admin-api/staff-schemas";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ userId: string }> };

/** DELETE /api/admin/staff/[userId]: the couple revokes access. */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    await requireCouple();
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  const { userId } = await params;
  const notFound = () =>
    errorResponse(404, "not_found", "That staff member was not found.");
  if (!staffUserIdSchema.safeParse(userId).success) return notFound();

  const { data, error } = await createAdminSupabase()
    .from("staff")
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    // The database refuses to remove or demote the last couple account.
    if (/last couple/i.test(error.message ?? "")) {
      return errorResponse(
        409,
        "last_couple",
        "The last couple member cannot be removed.",
      );
    }
    log.error("staff_revoke_failed", { code: error.code ?? "unknown" });
    return errorResponse(500, "server_error", "Access was not revoked.");
  }
  if (!data || data.length === 0) return notFound();
  return new Response(null, { status: 204 });
}
