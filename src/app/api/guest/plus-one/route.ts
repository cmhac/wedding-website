import { authErrorResponse, requireGuest } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { plusOneRequestSchema } from "@/lib/guest-api/schemas";
import { rpcErrorResponse } from "@/lib/guest-api/rpc-errors";
import { callRpc, readJson } from "@/lib/guest-api/request";

export async function POST(request: Request) {
  try {
    const session = await requireGuest();
    const parsed = plusOneRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { data, error } = await callRpc(
      session.supabase,
      "name_plus_one",
      parsed.data,
    );
    if (error) return rpcErrorResponse(error);
    return Response.json(data);
  } catch (e) {
    return (
      authErrorResponse(e) ??
      errorResponse(500, "server_error", "Something went wrong.")
    );
  }
}
