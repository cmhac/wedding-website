import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { inviteLinkUrl } from "@/lib/auth/invite-link";
import type { Session } from "@/lib/auth/session";
import { log } from "@/lib/log";

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

/** The household's current link, read through the staff-only function (the version is a staff-only column). */
async function currentLink(session: Session, id: string): Promise<Response> {
  const { data, error } = await session.supabase
    .rpc("staff_households")
    .eq("id", id)
    .single();
  if (error || !data) {
    if (error?.code === "PGRST116") return notFound();
    log.error("invite_link_read_failed", { code: "read" });
    return errorResponse(500, "server_error", "The link could not be read.");
  }
  const row = data as {
    invite_link_version: number;
    invite_link_issued_at: string;
  };
  return Response.json(
    {
      url: inviteLinkUrl(id, row.invite_link_version),
      issued_at: row.invite_link_issued_at,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** GET /api/admin/households/[id]/invite-link: the household's current personal link, to copy. */
export async function GET(_request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();
  return currentLink(guarded.session, id);
}

/** POST /api/admin/households/[id]/invite-link: issue a new link; the old one stops working at once. */
export async function POST(_request: Request, { params }: Context) {
  const guarded = await guard();
  if ("denied" in guarded) return guarded.denied;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const { error } = await guarded.session.supabase.rpc("reissue_invite_link", {
    household_id: id,
  });
  if (error) {
    if (error.message === "not_found") return notFound();
    if (error.message === "forbidden") {
      return errorResponse(403, "forbidden", "Not allowed.");
    }
    log.error("invite_link_reissue_failed", { code: "rpc" });
    return errorResponse(500, "server_error", "The link was not reissued.");
  }
  return currentLink(guarded.session, id);
}
