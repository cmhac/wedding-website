import { authErrorResponse, requireGuest } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { optOutRequestSchema } from "@/lib/guest-api/schemas";
import { rpcErrorResponse } from "@/lib/guest-api/rpc-errors";
import { callRpc, readJson } from "@/lib/guest-api/request";

export async function POST(request: Request) {
  try {
    const session = await requireGuest();
    const parsed = optOutRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { error } = await callRpc(session.supabase, "set_reminders_opt_out", {
      opt_out: parsed.data.opt_out,
    });
    if (error) return rpcErrorResponse(error);
    return Response.json({ opt_out: parsed.data.opt_out });
  } catch (e) {
    return (
      authErrorResponse(e) ??
      errorResponse(500, "server_error", "Something went wrong.")
    );
  }
}
