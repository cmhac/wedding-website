/**
 * Plain-English messages for every refusal the admin console can show: the
 * route handler codes in docs/admin-api.md, the console's own codes, and the
 * refusals the database raises directly. Raw error text is never shown.
 */

const MESSAGES = {
  // Route handler codes (docs/admin-api.md, "Error codes").
  unauthenticated: "Your session has ended. Please sign in again.",
  forbidden: "You do not have access to this.",
  not_found: "That could not be found. It may have been deleted.",
  email_in_use: "That email address already belongs to another household.",
  staff_account:
    "This household is linked to a staff sign-in, so its email cannot be changed here.",
  last_couple: "The last couple member cannot be removed.",
  campaign_not_sendable:
    "This campaign cannot be sent now. Only a draft or scheduled campaign can be sent.",
  template_missing:
    "This campaign has no email template registered yet, so it cannot be sent.",
  invalid_audience:
    "The audience for this campaign is not valid. Please check it and try again.",
  invalid_request: "Some of what you entered is not valid. Please check it.",
  invalid_payload: "Some of what you entered is not valid. Please check it.",
  invalid_file: "That file could not be read. Please check it and try again.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  server_error: "Something went wrong on our side. Please try again.",
  // The console's own codes.
  network:
    "The request could not be sent. Check your connection and try again.",
  bad_response: "The response was not understood. Please try again.",
  unknown: "Something went wrong. Please try again.",
  // Refusals the database raises directly.
  allowance_below_named_plus_ones:
    "The plus-one allowance cannot be lower than the number of plus-ones already named.",
  duplicate_guest_name: "A guest with that name is already in this household.",
  invalid_meal:
    "That meal choice is not allowed. A guest who has declined cannot have a meal, and an archived dish cannot be chosen.",
  campaign_locked:
    "This campaign has already been sent or scheduled, so it can no longer be edited.",
  invalid_status_transition:
    "This campaign cannot move to that status from where it is now.",
} as const satisfies Record<string, string>;

export type MessageCode = keyof typeof MESSAGES;

/** The message for a code; anything unrecognised gets the generic message. */
export function messageFor(code: string): string {
  return Object.prototype.hasOwnProperty.call(MESSAGES, code)
    ? MESSAGES[code as MessageCode]
    : MESSAGES.unknown;
}

/** Ordered: the first matching pattern wins. */
const DB_PATTERNS: Array<[RegExp, MessageCode]> = [
  [/below the number of named plus-ones/i, "allowance_below_named_plus_ones"],
  [/plus-one allowance exceeded/i, "allowance_below_named_plus_ones"],
  [/duplicate_name/i, "duplicate_guest_name"],
  [/last couple/i, "last_couple"],
  [/invalid_meal|archived/i, "invalid_meal"],
  [/campaign_locked/i, "campaign_locked"],
  [/invalid_status_transition/i, "invalid_status_transition"],
  [/email_in_use/i, "email_in_use"],
  [/staff_account/i, "staff_account"],
  [/\bforbidden\b/i, "forbidden"],
  [/\bnot_found\b/i, "not_found"],
  [/invalid_payload/i, "invalid_payload"],
];

/** Maps a Supabase error to a plain message; unrecognised errors get server_error. */
export function messageFromDbError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string {
  const text = error?.message ?? "";
  for (const [pattern, code] of DB_PATTERNS) {
    if (pattern.test(text)) return MESSAGES[code];
  }
  return MESSAGES.server_error;
}
