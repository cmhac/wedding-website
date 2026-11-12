import { errorResponse } from "@/lib/api-errors";
import { DispatchError } from "@/lib/campaigns/dispatch";

/** How a failed send becomes an HTTP answer, shared by the send and test-send routes. */
export function dispatchFailure(e: unknown): Response | null {
  if (!(e instanceof DispatchError)) return null;
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
    default:
      return null;
  }
}
