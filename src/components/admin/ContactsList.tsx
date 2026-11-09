"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  addContact,
  removeContact,
  updateContact,
} from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert, Badge, Field } from "./primitives";

export type ContactItem = {
  id: string;
  value: string;
  deliveryProblem: boolean;
};

type Mode =
  | { kind: "view" }
  | { kind: "edit"; id: string }
  | { kind: "remove"; id: string };

/**
 * A household's email addresses, with add, change and remove. Every address
 * gets the household's invitations and reaches the same RSVP. Changing one
 * clears its delivery problem flag; removing the last one makes the household
 * paper only. Presentational markup only; changes go through the admin route
 * handlers.
 */
export function ContactsList({
  householdId,
  contacts,
}: {
  householdId: string;
  contacts: ContactItem[];
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

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = adding.trim();
    if (value === "") return;
    const ok = await run(async () => {
      const res = await addContact(householdId, value);
      return res.ok
        ? { ok: true }
        : { ok: false, message: messageFor(res.error.code) };
    });
    if (ok) {
      setAdding("");
      setNotice("Address added.");
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const value = draft.trim();
    if (value === "") return;
    const ok = await run(async () => {
      const res = await updateContact(householdId, id, value);
      return res.ok
        ? { ok: true }
        : { ok: false, message: messageFor(res.error.code) };
    });
    if (ok) setNotice("Address saved. Its delivery problem flag is cleared.");
  }

  async function onRemove(id: string) {
    const ok = await run(async () => {
      const res = await removeContact(householdId, id);
      return res.ok
        ? { ok: true }
        : { ok: false, message: messageFor(res.error.code) };
    });
    if (ok) setNotice("Address removed.");
  }

  const last = contacts.length === 1;

  return (
    <fieldset className="group">
      <legend>Email addresses</legend>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="ok">{notice}</Alert> : null}
      {contacts.length === 0 ? (
        <p className="muted">None. This household is paper only.</p>
      ) : (
        <ul className="plain stack-sm">
          {contacts.map((contact) => (
            <li key={contact.id}>
              {mode.kind === "edit" && mode.id === contact.id ? (
                <form
                  className="row"
                  onSubmit={(e) => onSave(e, contact.id)}
                  noValidate
                >
                  <input
                    type="email"
                    aria-label={`New address for ${contact.value}`}
                    autoComplete="off"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button type="submit" className="btn" disabled={pending}>
                    Save address
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
                  <span>{contact.value}</span>
                  {contact.deliveryProblem ? (
                    <Badge variant="bad">Delivery problem</Badge>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Change ${contact.value}`}
                    onClick={() => {
                      setDraft(contact.value);
                      setError(null);
                      setMode({ kind: "edit", id: contact.id });
                    }}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Remove ${contact.value}`}
                    onClick={() => {
                      setError(null);
                      setMode({ kind: "remove", id: contact.id });
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
              {mode.kind === "remove" && mode.id === contact.id ? (
                <div className="alert alert-warn stack-sm" role="alertdialog">
                  <p>
                    Remove {contact.value}? It stops getting emails from the
                    site straight away.
                    {last
                      ? " This is the last address, so the household becomes paper only."
                      : ""}
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={pending}
                      onClick={() => onRemove(contact.id)}
                    >
                      Remove address
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
          ))}
        </ul>
      )}
      <form className="stack-sm" onSubmit={onAdd} noValidate>
        <Field
          id="add-contact"
          label="Add an email address"
          hint="Everyone with an address here gets the invitation and reaches the same household."
        >
          <input
            id="add-contact"
            type="email"
            autoComplete="off"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
        </Field>
        <div className="row">
          <button type="submit" className="btn" disabled={pending}>
            Add address
          </button>
        </div>
      </form>
    </fieldset>
  );
}
