import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import {
  createHouseholdRequestSchema,
  householdSchema,
} from "@/lib/admin-api/schemas";
import { createHouseholdWithAccess } from "@/lib/guests/household-access";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** POST /api/admin/households: a household with its guests and sign-in account. */
export async function POST(request: Request) {
  try {
    await requireStaff();
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
  const parsed = createHouseholdRequestSchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  const result = await createHouseholdWithAccess(createAdminSupabase(), {
    ...parsed.data,
    contact_email: parsed.data.contact_email ?? null,
    address: parsed.data.address ?? null,
    notes: parsed.data.notes ?? null,
  });
  if (!result.ok) {
    if (result.code === "email_in_use") {
      return errorResponse(
        409,
        "email_in_use",
        "That email address is already used by another household. Use a different address.",
      );
    }
    log.error("household_create_failed", { code: result.code });
    return errorResponse(500, "server_error", "The household was not created.");
  }
  return Response.json(
    {
      household: householdSchema.parse(result.household),
      guest_ids: result.guestIds,
    },
    { status: 201 },
  );
}
