import { authErrorResponse, requireGuest } from "@/lib/auth/guards";
import { validationError } from "@/lib/api-errors";
import { rsvpSubmitSchema } from "@/lib/guest-api/schemas";
import { rpcErrorResponse } from "@/lib/guest-api/rpc-errors";
import { callRpc, readJson } from "@/lib/guest-api/request";
import { maskEmail } from "@/lib/guest-api/mask";
import { errorResponse } from "@/lib/api-errors";
import type { SupabaseClient } from "@supabase/supabase-js";

type Rsvp = {
  guests?: { invitations?: { event?: { closed?: boolean } }[] }[];
};

/**
 * Adds what the database RSVP does not carry: the household's addresses
 * (masked: the database returns them, the guest sees only the masked form) and
 * `deadline_passed` (every invited event is closed, which also covers RSVPs
 * closed globally). A failure to read the addresses is the caller's error.
 */
async function withExtras(supabase: SupabaseClient, rsvp: unknown) {
  const contacts = await callRpc(supabase, "get_my_contacts");
  if (contacts.error) return rpcErrorResponse(contacts.error);
  const events = ((rsvp as Rsvp)?.guests ?? []).flatMap((g) =>
    (g.invitations ?? []).map((i) => i.event?.closed === true),
  );
  return Response.json({
    ...(rsvp as object),
    contacts: ((contacts.data ?? []) as { value: string }[]).map((c) => ({
      kind: "email",
      masked: maskEmail(String(c.value)),
    })),
    deadline_passed: events.length > 0 && events.every(Boolean),
  });
}

export async function GET() {
  try {
    const session = await requireGuest();
    const { data, error } = await callRpc(session.supabase, "get_my_rsvp");
    if (error) return rpcErrorResponse(error);
    return await withExtras(session.supabase, data);
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
    return await withExtras(session.supabase, data);
  } catch (e) {
    return authErrorResponse(e) ?? serverError();
  }
}

function serverError() {
  return errorResponse(500, "server_error", "Something went wrong.");
}
