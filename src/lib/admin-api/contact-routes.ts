import { errorResponse } from "@/lib/api-errors";
import type { HouseholdAccessFailure } from "@/lib/guests/household-access";

/**
 * Shared by the household contact routes: how a helper's failure code becomes
 * an HTTP answer. No message ever contains an address.
 */
export function contactFailure(code: HouseholdAccessFailure["code"]) {
  switch (code) {
    case "email_in_use":
      return errorResponse(
        409,
        "email_in_use",
        "That email address is already used by another household.",
      );
    case "staff_account":
      return errorResponse(
        409,
        "staff_account",
        "That email address belongs to a staff sign-in account and cannot be used for a household.",
      );
    case "not_found":
      return errorResponse(404, "not_found", "Household or address not found.");
    case "invalid_payload":
      return errorResponse(422, "invalid_payload", "The request is not valid.");
    default:
      return errorResponse(500, "server_error", "The address was not saved.");
  }
}
