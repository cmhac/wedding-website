import "server-only";
import { getSmsState } from "@/lib/sms/state";
import type { LooseDb } from "./props";
import { firstBlocked, loadReadiness, type ReadinessItem } from "./readiness";

/**
 * The check before a real save the date send: a hard gap in the readiness list
 * (no email template when email is chosen, no wedding date, no site address)
 * stops the send with its reason; warnings never do. Test sends and every other
 * message type pass straight through. An unknown campaign is left to the sender
 * to report.
 */
export async function sendGate(
  db: LooseDb,
  campaignId: string,
): Promise<ReadinessItem | null> {
  const { data: campaign } = (await db
    .from("campaigns")
    .select("message_type_key, channel, is_test")
    .eq("id", campaignId)
    .maybeSingle()) as {
    data: {
      message_type_key: string;
      channel: string | null;
      is_test: boolean | null;
    } | null;
  };
  if (
    !campaign ||
    campaign.is_test ||
    campaign.message_type_key !== "save_the_date"
  ) {
    return null;
  }
  const channel =
    campaign.channel === "text" || campaign.channel === "both"
      ? campaign.channel
      : "email";
  const sms = await getSmsState().catch(() => ({
    configured: false,
    enabled: false,
  }));
  const items = await loadReadiness(db, {
    channel,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    sms: { configured: sms.configured, enabled: sms.enabled },
  });
  return firstBlocked(items);
}
