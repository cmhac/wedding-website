/**
 * Twilio's message statuses mapped to ours, and error codes in plain English for
 * the console (research: Delivery notifications). Codes to check against
 * Twilio's error dictionary when the account is live.
 */

export type OurStatus = "sending" | "sent" | "delivered" | "failed";

export function statusForTwilio(status: string): OurStatus | null {
  switch (status) {
    case "queued":
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

const REASONS: Record<string, string> = {
  opted_out: "The recipient replied STOP",
  "21610": "The recipient replied STOP",
  "30003": "The phone is unreachable or switched off",
  "30005": "Unknown number: it may not exist any more",
  "30006": "Landline or a carrier that cannot receive texts",
  "30007": "Blocked by the carrier's spam filter",
  unknown_outcome: "Sent but not confirmed: check Twilio before re-sending",
  invalid_number: "Not a valid United States number",
  not_configured: "Texting was not set up when this was sent",
};

export function plainErrorReason(code: string | null | undefined): string {
  if (!code) return "Failed";
  return REASONS[code] ?? `Twilio error ${code}`;
}
