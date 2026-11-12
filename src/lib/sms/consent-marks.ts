import "server-only";
import { callRpc } from "@/lib/guest-api/request";

/**
 * Staff-marked consent (specs/006-save-the-date-outreach, research R5). A thin
 * wrapper over the `staff_set_sms_consent` database function, which does the
 * work all or nothing and only for staff, so it must be called with the staff
 * member's own client, never the service role. It never sends a text: the
 * first message to a number does the confirming. It never logs a number.
 */

export type ConsentCounts = {
  marked: number;
  cleared: number;
  already: number;
  declinedSkipped: number;
  householdsWithoutPhone: number;
  households: number;
  dryRun: boolean;
};

export type ConsentFailureCode =
  | "forbidden"
  | "not_found"
  | "declined_needs_override"
  | "invalid_payload"
  | "failed";

export type SetConsentArgs = {
  householdIds: string[];
  /** One number of those households; otherwise every phone number of them. */
  contactId?: string | null;
  mode: "mark" | "clear";
  /** Mark numbers that declined at the site too. */
  overrideDeclined?: boolean;
  note?: string | null;
  /** Count only; change nothing. */
  dryRun?: boolean;
};

const KNOWN: ConsentFailureCode[] = [
  "forbidden",
  "not_found",
  "declined_needs_override",
  "invalid_payload",
];

const n = (value: unknown) => (typeof value === "number" ? value : 0);

export async function setSmsConsent(
  staffClient: unknown,
  args: SetConsentArgs,
): Promise<
  { ok: true; counts: ConsentCounts } | { ok: false; code: ConsentFailureCode }
> {
  const note = args.note?.trim() ? args.note.trim() : null;
  const { data, error } = await callRpc(staffClient, "staff_set_sms_consent", {
    household_ids: args.householdIds,
    contact_id: args.contactId ?? null,
    mode: args.mode,
    override_declined: args.overrideDeclined ?? false,
    note,
    dry_run: args.dryRun ?? false,
  });
  if (error) {
    const code = KNOWN.find((k) => k === error.message);
    return { ok: false, code: code ?? "failed" };
  }
  if (!data || typeof data !== "object") return { ok: false, code: "failed" };
  const row = data as Record<string, unknown>;
  return {
    ok: true,
    counts: {
      marked: n(row.marked),
      cleared: n(row.cleared),
      already: n(row.already),
      declinedSkipped: n(row.declined_skipped),
      householdsWithoutPhone: n(row.households_without_phone),
      households: n(row.households),
      dryRun: row.dry_run === true,
    },
  };
}
