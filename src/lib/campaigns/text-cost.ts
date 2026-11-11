import { destinationFor, withDestination } from "@/lib/auth/destination";
import { getText, type TextRegistry } from "@/lib/sms/texts";
import { TEXT_INTERVAL_MS } from "./dispatch";
import { textSegments } from "./send-window";

/**
 * What a campaign's texts will cost in segments and time, for the preview
 * (research R6). It renders the real wording with a link of the real length
 * (a household's personal link is a fixed length, plus the landing for a save
 * the date), so the count is the count the guest's phone will see. Null when
 * the type has no registered text.
 */

const SAMPLE_SITE = "https://hannahandchris.wedding";

export type TextCost = {
  segmentsPerText: number;
  totalSegments: number;
  /** Minutes to send them all at the dispatcher's pace. */
  minutes: number;
};

export function previewTextCost(
  messageTypeKey: string,
  texts: number,
  siteUrl: string,
  registry?: TextRegistry,
  intervalMs: number = TEXT_INTERVAL_MS,
): TextCost | null {
  let body: string;
  try {
    const base = (siteUrl || SAMPLE_SITE).replace(/\/+$/, "");
    const link = withDestination(
      `${base}/i/${"x".repeat(22)}.${"x".repeat(43)}`,
      destinationFor(messageTypeKey),
    );
    body = getText(
      messageTypeKey,
      registry,
    )({
      personal_link: link,
      respond_by: "Sep 1",
    });
  } catch {
    return null;
  }
  const segmentsPerText = textSegments(body);
  return {
    segmentsPerText,
    totalSegments: segmentsPerText * texts,
    minutes: Math.ceil((texts * intervalMs) / 60_000),
  };
}
