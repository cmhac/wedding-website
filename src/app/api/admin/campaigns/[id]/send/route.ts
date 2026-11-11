import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import { sendCampaignResponseSchema } from "@/lib/admin-api/campaign-schemas";
import { dispatchFailure } from "@/lib/admin-api/campaign-routes";
import { DispatchError, sendCampaign } from "@/lib/campaigns/dispatch";
import { sendGate } from "@/lib/campaigns/send-gate";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Allows one run to spend up to 45 seconds sending texts (decision 0014). */
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

const idSchema = z.guid();

/** POST /api/admin/campaigns/[id]/send: send a draft or scheduled campaign now. */
export async function POST(_request: Request, { params }: Context) {
  try {
    await requireStaff();
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  const id = idSchema.safeParse((await params).id);
  if (!id.success) {
    return errorResponse(404, "not_found", "Campaign not found.");
  }

  try {
    const admin = createAdminSupabase();
    // A real save the date is held back by a hard gap in the readiness list.
    const blocked = await sendGate(admin, id.data);
    if (blocked) return errorResponse(409, "not_ready", blocked.detail);
    const result = await sendCampaign(admin, id.data);
    return Response.json(sendCampaignResponseSchema.parse(result));
  } catch (e) {
    const failure = dispatchFailure(e);
    if (failure) return failure;
    if (e instanceof DispatchError) {
      switch (e.code) {
        case "campaign_not_found":
          return errorResponse(404, "not_found", "Campaign not found.");
        case "campaign_not_sendable":
          return errorResponse(
            409,
            "campaign_not_sendable",
            "Only a draft, scheduled or interrupted campaign can be sent.",
          );
        case "template_missing":
          return errorResponse(
            409,
            "template_missing",
            "No email template is registered for this message type yet.",
          );
        case "invalid_audience":
          return errorResponse(
            422,
            "invalid_audience",
            "The campaign's audience is not valid.",
          );
      }
    }
    log.error("campaign_send_failed", {
      campaign_id: id.data,
      code: e instanceof DispatchError ? e.code : "unexpected",
    });
    return errorResponse(500, "server_error", "The campaign was not sent.");
  }
}
