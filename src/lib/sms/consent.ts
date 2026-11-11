import "server-only";
import { log } from "@/lib/log";
import { maskPhone } from "./phone";
import { sendText } from "./send";
import { getSmsState, type SmsState } from "./state";
import { renderText } from "./texts";
import { statusCallbackUrl } from "./urls";

/**
 * The server side of both opt-in routes (research: How an opt-in is recorded).
 * Opting in is recorded by a database function; this sends the one confirmation
 * text for each number newly opted in. A failed confirmation never undoes the
 * recorded opt-in. Logs hold outcome codes only: never a number or a body.
 */

type Rpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type Contact = {
  id: string;
  kind: string;
  value: string;
  consent: string | null;
};

export type PendingNumber = { id: string; masked: string };

async function readContacts(db: Rpc): Promise<Contact[] | null> {
  const { data, error } = await db.rpc("get_my_contacts");
  if (error || !Array.isArray(data)) return null;
  return data as Contact[];
}

/** The numbers still to ask about, masked; nothing while texting is not available. */
export async function getConsentPrompt(
  db: Rpc,
  /** The state the caller already read, to avoid a second settings query. */
  known?: SmsState,
): Promise<{ available: boolean; pending: PendingNumber[] }> {
  const state = known ?? (await getSmsState());
  if (!state.available) return { available: false, pending: [] };
  const contacts = await readContacts(db);
  const pending = (contacts ?? [])
    .filter((c) => c.kind === "phone" && c.consent === "not_asked")
    .map((c) => ({ id: c.id, masked: maskPhone(c.value) }));
  return { available: true, pending };
}

/** Sends the registered confirmation text to a number that just opted in. */
export async function sendConfirmationText(
  to: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    const result = await sendText({
      to,
      body: renderText("sms_confirmation", {}),
      statusCallback: statusCallbackUrl(),
    });
    if (result.ok) {
      log.info("sms_confirmation", { outcome: "sent" });
      return { ok: true };
    }
    log.warn("sms_confirmation", { outcome: result.code });
    return { ok: false, code: result.code };
  } catch {
    log.warn("sms_confirmation", { outcome: "exception" });
    return { ok: false, code: "exception" };
  }
}

export type ConsentAnswer = { id: string; opt_in: boolean };

/** Records a guest's answers, then confirms each number newly opted in. */
export async function answerConsent(
  db: Rpc,
  answers: ConsentAnswer[],
): Promise<{ ok: true; saved: number } | { ok: false; code: string }> {
  const state = await getSmsState();
  if (!state.available) return { ok: false, code: "texting_unavailable" };

  const recorded = await db.rpc("record_sms_consent", {
    answers: answers.map((a) => ({ contact_id: a.id, opt_in: a.opt_in })),
  });
  if (recorded.error) return { ok: false, code: "record_failed" };

  const opted = new Set(
    Array.isArray(recorded.data) ? (recorded.data as string[]) : [],
  );
  // Read after recording, so the numbers are current. If they cannot be read
  // the opt-in stays recorded, and the missed confirmation is logged.
  const contacts = opted.size > 0 ? await readContacts(db) : [];
  if (contacts === null) {
    log.warn("sms_confirmation", { outcome: "contacts_unreadable" });
  }
  for (const contact of contacts ?? []) {
    if (opted.has(contact.id) && contact.kind === "phone") {
      await sendConfirmationText(contact.value);
    }
  }
  return { ok: true, saved: answers.length };
}
