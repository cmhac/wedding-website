import { z } from "zod";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse, validationError } from "@/lib/api-errors";
import { sendCampaignResponseSchema } from "@/lib/admin-api/campaign-schemas";
import { dispatchFailure } from "@/lib/admin-api/campaign-routes";
import { MESSAGE_TYPE_KEYS } from "@/lib/campaigns/audience";
import { sendCampaign } from "@/lib/campaigns/dispatch";
import { log } from "@/lib/log";
import { isSmsConfigured } from "@/lib/sms/state";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Allows one run to spend up to 45 seconds sending texts (decision 0014). */
export const maxDuration = 60;

const bodySchema = z.object({
  message_type_key: z.enum(MESSAGE_TYPE_KEYS),
  channel: z.enum(["email", "text", "both"]),
  household_id: z.guid(),
});

/**
 * POST /api/admin/campaigns/test: a rehearsal send to one household, through
 * the same path and wording as the real send (research R8). It creates a
 * campaign marked as a test, so it is labelled in the delivery view and never
 * counts as the real send for the "not yet sent" filter. Staff only.
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireStaff();
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error);
  const { message_type_key, channel, household_id } = parsed.data;

  try {
    const household = await session.supabase
      .from("households")
      .select("id")
      .eq("id", household_id)
      .maybeSingle();
    if (household.error || !household.data) {
      return errorResponse(404, "not_found", "Household not found.");
    }
    const id = crypto.randomUUID();
    const created = await session.supabase.from("campaigns").insert({
      id,
      name: `Test: ${message_type_key}`,
      message_type_key,
      audience: { scope: "household", household_id },
      status: "draft",
      is_test: true,
      // The channel is saved only while texting is configured; otherwise email.
      ...(isSmsConfigured() ? { channel } : {}),
    });
    if (created.error) {
      log.error("test_campaign_create_failed", {});
      return errorResponse(500, "server_error", "The test was not sent.");
    }
    const result = await sendCampaign(createAdminSupabase(), id);
    return Response.json(sendCampaignResponseSchema.parse(result));
  } catch (e) {
    const failure = dispatchFailure(e);
    if (failure) return failure;
    log.error("test_campaign_send_failed", {});
    return errorResponse(500, "server_error", "The test was not sent.");
  }
}
