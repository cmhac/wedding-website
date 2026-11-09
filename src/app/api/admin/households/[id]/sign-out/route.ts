import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.guid();

/**
 * POST /api/admin/households/[id]/sign-out: ends every session of the
 * household on every device (research R10). Guest access stops on the next
 * request. Staff are checked first; the function itself is service-role only.
 */
export async function POST(_request: Request, { params }: Context) {
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

  const { error } = await createAdminSupabase().rpc(
    "revoke_household_sessions",
    { household_id: id },
  );
  if (error) {
    if (error.message === "not_found") {
      return errorResponse(404, "not_found", "Household not found.");
    }
    log.error("household_sign_out_failed", { code: "rpc" });
    return errorResponse(
      500,
      "server_error",
      "The household was not signed out.",
    );
  }
  return new Response(null, { status: 204 });
}
