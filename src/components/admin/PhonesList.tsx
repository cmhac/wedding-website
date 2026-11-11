"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { addPhone, removePhone, updatePhone } from "@/lib/admin-api/client";
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
};

type Mode =
  | { kind: "view" }
  | { kind: "edit"; id: string }
  | { kind: "remove"; id: string };

/**
 * A household's phone numbers with their opt-in state. Staff add, change and
 * remove numbers; nothing here can mark a number as opted in, because only the
 * guest's own ticked box can. Shown only while the text provider is configured.
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
          hint="United States numbers only. A number is texted only after its owner ticks the box themselves; nothing here can do that for them."
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

function ConsentBadge({ phone }: { phone: PhoneItem }) {
  if (phone.consent === "opted_in") {
    return (
      <Badge variant="ok">
        Opted in{phone.consentAt ? ` ${formatPacific(phone.consentAt)}` : ""}
      </Badge>
    );
  }
  if (phone.consent === "declined")
    return <Badge variant="warn">Declined</Badge>;
  return <Badge>Not asked</Badge>;
}
