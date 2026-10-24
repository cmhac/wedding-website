import { z } from "zod";

/** Response of POST /api/admin/campaigns/[id]/send (contracts/http-endpoints.md). */
export const sendCampaignResponseSchema = z.object({
  campaign_id: z.guid(),
  queued: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.object({
    no_email: z.number().int().nonnegative(),
    opted_out: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  failed: z.number().int().nonnegative(),
});

export type SendCampaignResponse = z.infer<typeof sendCampaignResponseSchema>;
