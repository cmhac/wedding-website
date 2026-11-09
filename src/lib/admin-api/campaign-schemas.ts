import { z } from "zod";

/** Response of POST /api/admin/campaigns/[id]/send (contracts/http-endpoints.md). */
export const sendCampaignResponseSchema = z.object({
  campaign_id: z.guid(),
  /** Households the campaign reached or considered. */
  households: z.number().int().nonnegative(),
  /** Addresses a message was queued for: one email each. */
  addresses: z.number().int().nonnegative(),
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
