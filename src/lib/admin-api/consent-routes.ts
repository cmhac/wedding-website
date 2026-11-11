import { z } from "zod";
import { errorResponse } from "@/lib/api-errors";
import type {
  ConsentCounts,
  ConsentFailureCode,
} from "@/lib/sms/consent-marks";

/** Request bodies for marking consent (contracts/admin-api.md). */
const modeSchema = z.enum(["mark", "clear"]);
const noteSchema = z.string().trim().max(200).optional();

export const singleConsentRequestSchema = z.object({
  mode: modeSchema,
  override_declined: z.boolean().optional(),
  note: noteSchema,
});

export const batchConsentRequestSchema = z.object({
  household_ids: z.array(z.guid()).min(1).max(1000),
  mode: modeSchema,
  override_declined: z.boolean().optional(),
  note: noteSchema,
  dry_run: z.boolean().optional(),
});

/** The counts as the API returns them. */
export function consentCountsBody(counts: ConsentCounts) {
  return {
    marked: counts.marked,
    cleared: counts.cleared,
    already: counts.already,
    declined_skipped: counts.declinedSkipped,
    households_without_phone: counts.householdsWithoutPhone,
    households: counts.households,
    dry_run: counts.dryRun,
  };
}

/** How a failure becomes an HTTP answer. No message ever contains a number. */
export function consentFailure(code: ConsentFailureCode) {
  switch (code) {
    case "forbidden":
      return errorResponse(403, "forbidden", "You do not have access to this.");
    case "not_found":
      return errorResponse(404, "not_found", "Household or number not found.");
    case "declined_needs_override":
      return errorResponse(
        409,
        "declined_needs_override",
        "This number declined. Confirm to mark it anyway.",
      );
    case "invalid_payload":
      return errorResponse(
        422,
        "invalid_payload",
        "That request is not valid.",
      );
    default:
      return errorResponse(500, "server_error", "The change was not saved.");
  }
}
