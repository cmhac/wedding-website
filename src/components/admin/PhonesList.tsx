"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  addPhone,
  removePhone,
  setPhoneConsent,
  updatePhone,
} from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { formatPacific } from "@/lib/admin/time";
import { formatPhoneForStaff } from "@/lib/sms/phone-format";
import { Alert, Badge, Field } from "./primitives";

export type PhoneItem = {
  id: string;
  /** E.164, as stored. */
  value: string;
  deliveryProblem: boolean;
  consent: string;
  consentAt: string | null;
  /** How the answer was recorded: the guest's tick, staff, or the import. */
  consentSource: "guest" | "staff" | "import" | null;
  /** The staff member who marked it. */
  consentBy: string | null;
  consentNote: string | null;
  /** True when a staff mark replaced a decline. */
  overrodeDecline: boolean;
};

type Mode =
  | { kind: "view" }
  | { kind: "edit"; id: string }
  | { kind: "remove"; id: string }
  | { kind: "consent"; id: string };

/**
 * A household's phone numbers with their opt-in state. Staff add, change and
 * remove numbers, and can mark a number as consented when its owner agreed
 * before the site existed (the record shows who and how; marking sends no
 * text). Shown only while the text provider is configured.
 * Presentational markup; changes go through the admin route handlers.
 */
export function PhonesList({
  householdId,
  phones,
}: {
  householdId: string;
  phones: PhoneItem[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function run(work: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await work();
    setPending(false);
    if (result.ok) {
      setMode({ kind: "view" });
      router.refresh();
    } else {
      setError(result.message ?? messageFor("unknown"));
    }
    return result.ok;
  }

  const outcome = (res: { ok: boolean; error?: { code: string } }) =>
    res.ok
      ? { ok: true }
      : { ok: false, message: messageFor(res.error?.code ?? "unknown") };

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = adding.trim();
    if (value === "") return;
    const ok = await run(async () =>
      outcome(await addPhone(householdId, value)),
    );
    if (ok) {
      setAdding("");
      setNotice("Number added. It has not been asked about texts yet.");
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const value = draft.trim();
    if (value === "") return;
    const ok = await run(async () =>
      outcome(await updatePhone(householdId, id, value)),
    );
    if (ok) setNotice("Number saved. It has not been asked about texts yet.");
  }

  async function onRemove(id: string) {
    const ok = await run(async () =>
      outcome(await removePhone(householdId, id)),
    );
    if (ok) setNotice("Number removed.");
  }

  async function onMark(phone: PhoneItem) {
    const ok = await run(async () =>
      outcome(
        await setPhoneConsent(householdId, phone.id, {
          mode: "mark",
          override_declined: phone.consent === "declined",
          note: note.trim(),
        }),
      ),
    );
    if (ok) {
      setNote("");
      setNotice("Marked as consented. Nothing was sent.");
    }
  }

  async function onClear(phone: PhoneItem) {
    const ok = await run(async () =>
      outcome(await setPhoneConsent(householdId, phone.id, { mode: "clear" })),
    );
    if (ok) setNotice("Consent mark cleared. The number is not asked yet.");
  }

  return (
    <fieldset className="group">
      <legend>Phone numbers</legend>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="ok">{notice}</Alert> : null}
      {phones.length === 0 ? (
        <p className="muted">No phone numbers.</p>
      ) : (
        <ul className="plain stack-sm">
          {phones.map((phone) => {
            const shown = formatPhoneForStaff(phone.value);
            return (
              <li key={phone.id}>
                {mode.kind === "edit" && mode.id === phone.id ? (
                  <form
                    className="row"
                    onSubmit={(e) => onSave(e, phone.id)}
                    noValidate
                  >
                    <input
                      type="tel"
                      aria-label={`New number for ${shown}`}
                      autoComplete="off"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button type="submit" className="btn" disabled={pending}>
                      Save number
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setMode({ kind: "view" })}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="row">
                    <span>{shown}</span>
                    <ConsentBadge phone={phone} />
                    {phone.deliveryProblem ? (
                      <Badge variant="bad">Delivery problem</Badge>
                    ) : null}
                    {phone.consent !== "opted_in" ? (
                      <button
                        type="button"
                        className="btn"
                        aria-label={`Mark ${shown} as consented`}
                        onClick={() => {
                          setError(null);
                          setNote("");
                          setMode({ kind: "consent", id: phone.id });
                        }}
                      >
                        Mark as consented
                      </button>
                    ) : phone.consentSource !== "guest" ? (
                      <button
                        type="button"
                        className="btn"
                        aria-label={`Clear consent mark for ${shown}`}
                        disabled={pending}
                        onClick={() => onClear(phone)}
                      >
                        Clear mark
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Change ${shown}`}
                      onClick={() => {
                        setDraft(shown);
                        setError(null);
                        setMode({ kind: "edit", id: phone.id });
                      }}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Remove ${shown}`}
                      onClick={() => {
                        setError(null);
                        setMode({ kind: "remove", id: phone.id });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                {mode.kind === "consent" && mode.id === phone.id ? (
                  <div className="alert alert-warn stack-sm" role="group">
                    <p>
                      {phone.consent === "declined"
                        ? `This number declined texts at the site. Mark it anyway only if its owner has since agreed. `
                        : ""}
                      Mark {shown} as consented only if its owner agreed to be
                      texted. The record shows you marked it. Nothing is sent
                      when you mark it.
                    </p>
                    <Field
                      id={`consent-note-${phone.id}`}
                      label="Where the consent came from"
                      hint="Optional, for your own reference."
                    >
                      <input
                        id={`consent-note-${phone.id}`}
                        type="text"
                        maxLength={200}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </Field>
                    <div className="row">
                      <button
                        type="button"
                        className="btn"
                        disabled={pending}
                        onClick={() => onMark(phone)}
                      >
                        {phone.consent === "declined"
                          ? "Mark it anyway"
                          : "Mark as consented"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setMode({ kind: "view" })}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {mode.kind === "remove" && mode.id === phone.id ? (
                  <div className="alert alert-warn stack-sm" role="alertdialog">
                    <p>
                      Remove {shown}? It stops getting texts from the site
                      straight away, and its opt-in goes with it.
                    </p>
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={pending}
                        onClick={() => onRemove(phone.id)}
                      >
                        Remove number
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setMode({ kind: "view" })}
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <form className="stack-sm" onSubmit={onAdd} noValidate>
        <Field
          id="add-phone"
          label="Add a phone number"
          hint="United States numbers only. A number is texted only once its consent is recorded: its owner ticks the box on the site, or you mark it as consented."
        >
          <input
            id="add-phone"
            type="tel"
            autoComplete="off"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
        </Field>
        <div className="row">
          <button type="submit" className="btn" disabled={pending}>
            Add number
          </button>
        </div>
      </form>
    </fieldset>
  );
}

function sourceText(phone: PhoneItem): string {
  if (phone.consentSource === "staff") {
    return `marked by ${phone.consentBy ?? "staff"}${phone.overrodeDecline ? ", replaced a decline" : ""}`;
  }
  if (phone.consentSource === "import") return "imported";
  return "ticked by the guest";
}

function ConsentBadge({ phone }: { phone: PhoneItem }) {
  if (phone.consent === "opted_in") {
    return (
      <>
        <Badge variant="ok">
          Opted in{phone.consentAt ? ` ${formatPacific(phone.consentAt)}` : ""}
        </Badge>
        <span className="muted small">
          {sourceText(phone)}
          {phone.consentNote ? `: ${phone.consentNote}` : ""}
        </span>
      </>
    );
  }
  if (phone.consent === "declined")
    return <Badge variant="warn">Declined</Badge>;
  return <Badge>Not asked</Badge>;
}
