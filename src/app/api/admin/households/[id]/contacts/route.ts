import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { contactSchema } from "@/lib/admin-api/schemas";
import { contactFailure } from "@/lib/admin-api/contact-routes";
import { addHouseholdContact } from "@/lib/guests/household-access";
import { log } from "@/lib/log";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.guid();

/** POST /api/admin/households/[id]/contacts: add an address (it never touches the household's sign-in account). */
export async function POST(request: Request, { params }: Context) {
  let session;
  try {
    session = await requireStaff();
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
  const parsed = contactSchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);

  const result = await addHouseholdContact(
    session.supabase,
    id,
    parsed.data.value,
  );
  if (!result.ok) {
    if (result.code === "failed") {
      log.error("household_contact_add_failed", { code: result.code });
    }
    return contactFailure(result.code);
  }
  return Response.json(
    {
      contact: {
        id: result.contactId,
        kind: "email",
        value: parsed.data.value.trim().toLowerCase(),
      },
    },
    { status: 201 },
  );
}
