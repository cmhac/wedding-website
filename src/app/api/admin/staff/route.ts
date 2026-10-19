import { authErrorResponse, requireCouple } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { grantStaffRequestSchema } from "@/lib/admin-api/staff-schemas";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** POST /api/admin/staff: the couple grants planner access. */
export async function POST(request: Request) {
  try {
    await requireCouple();
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = undefined;
  }
  const parsed = grantStaffRequestSchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  const admin = createAdminSupabase();
  const created = await admin.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
  });
  const userId = created.data?.user?.id;
  if (created.error || !userId) {
    if (created.error?.code === "email_exists") {
      return errorResponse(
        409,
        "email_in_use",
        "That email address already has an account.",
      );
    }
    log.error("staff_grant_failed", { step: "create_user" });
    return errorResponse(500, "server_error", "Access was not granted.");
  }

  const inserted = await admin.from("staff").insert({
    user_id: userId,
    role: "planner",
    display_name: parsed.data.display_name,
  });
  if (inserted.error) {
    await admin.auth.admin.deleteUser(userId);
    log.error("staff_grant_failed", { step: "insert_staff" });
    return errorResponse(500, "server_error", "Access was not granted.");
  }

  return Response.json(
    {
      staff: {
        user_id: userId,
        role: "planner",
        display_name: parsed.data.display_name,
      },
    },
    { status: 201 },
  );
}
