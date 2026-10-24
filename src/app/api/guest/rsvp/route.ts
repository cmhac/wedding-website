import { authErrorResponse, requireGuest } from "@/lib/auth/guards";
import { validationError } from "@/lib/api-errors";
import { rsvpSubmitSchema } from "@/lib/guest-api/schemas";
import { rpcErrorResponse } from "@/lib/guest-api/rpc-errors";
import { callRpc, readJson } from "@/lib/guest-api/request";
import { errorResponse } from "@/lib/api-errors";

export async function GET() {
  try {
    const session = await requireGuest();
    const { data, error } = await callRpc(session.supabase, "get_my_rsvp");
    if (error) return rpcErrorResponse(error);
    return Response.json(data);
  } catch (e) {
    return authErrorResponse(e) ?? serverError();
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireGuest();
    const parsed = rsvpSubmitSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { data, error } = await callRpc(
      session.supabase,
      "submit_household_rsvp",
      { payload: parsed.data },
    );
    if (error) return rpcErrorResponse(error);
    return Response.json(data);
  } catch (e) {
    return authErrorResponse(e) ?? serverError();
  }
}

function serverError() {
  return errorResponse(500, "server_error", "Something went wrong.");
}
