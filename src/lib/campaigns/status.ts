/**
 * Message status ranking, shared by the Resend webhook handler. Mirrors the
 * database function `record_message_event`: an event moves a message forward
 * in rank, or to a terminal status if it is not already terminal.
 */

export const MESSAGE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "skipped",
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const STATUS_RANK = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
} as const;

const TERMINAL: readonly MessageStatus[] = ["bounced", "complained", "failed"];

export function isTerminal(status: MessageStatus): boolean {
  return TERMINAL.includes(status);
}

function rank(status: MessageStatus): number | null {
  return status in STATUS_RANK
    ? STATUS_RANK[status as keyof typeof STATUS_RANK]
    : null;
}

/** True when moving a message from `current` to `next` is a valid update. */
export function shouldAdvance(
  current: MessageStatus,
  next: MessageStatus,
): boolean {
  const from = rank(current);
  if (from === null) return false; // terminal or skipped: never changes
  if (isTerminal(next)) return true;
  const to = rank(next);
  return to !== null && to > from;
}

const EVENT_STATUS: Record<string, MessageStatus> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

/** Status for a Resend event type, or null for types we ignore. */
export function statusForEventType(type: string): MessageStatus | null {
  return EVENT_STATUS[type] ?? null;
}
