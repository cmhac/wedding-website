import { z } from "zod";
import { errorResponse } from "@/lib/api-errors";
import type { PhoneFailure } from "@/lib/sms/phones";

/** The body of a phone add or change: the number as typed. */
export const phoneRequestSchema = z.object({
  value: z.string().trim().min(1).max(40),
});

/** How a phone helper's failure becomes an HTTP answer. No message ever contains a number. */
export function phoneFailure(code: PhoneFailure["code"]) {
  switch (code) {
    case "invalid_phone":
      return errorResponse(
        422,
        "invalid_phone",
        "That is not a valid phone number.",
      );
    case "not_us_phone":
      return errorResponse(
        422,
        "not_us_phone",
        "Only United States numbers are supported. Use an email address instead.",
      );
    case "phone_in_use":
      return errorResponse(
        409,
        "phone_in_use",
        "That number is already used by another household.",
      );
    case "texting_not_configured":
      return errorResponse(
        409,
        "texting_not_configured",
        "Texting is not set up, so numbers cannot be saved.",
      );
    case "not_found":
      return errorResponse(404, "not_found", "Household or number not found.");
    default:
      return errorResponse(500, "server_error", "The number was not saved.");
  }
}
