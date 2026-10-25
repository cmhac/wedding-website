"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { deleteHousehold } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert } from "../primitives";

/**
 * The confirmation step for deleting a household. The delete runs through the
 * admin route handler (it also removes the sign-in account), so this is a
 * client form; it looks and reads like ConfirmPanel.
 */
export function DeleteHouseholdForm({
  householdId,
  householdName,
  cancelHref,
}: {
  householdId: string;
  householdName: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const id = useId();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed === householdName;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches) return;
    setPending(true);
    setError(null);
    const result = await deleteHousehold(householdId);
    setPending(false);
    if (result.ok) router.push("/admin/households");
    else setError(messageFor(result.error.code));
  }

  return (
    <div
      className="alert alert-error stack-sm"
      role="alertdialog"
      aria-labelledby={`${id}-heading`}
    >
      <h2 className="card-t" id={`${id}-heading`}>
        Delete {householdName}?
      </h2>
      <p>
        This deletes the household, its guests, all answers and meal choices,
        and its sign-in account. It cannot be undone.
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <form className="stack-sm" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor={`${id}-confirmation`}>
            Type the household name to confirm
          </label>
          <input
            id={`${id}-confirmation`}
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        <div className="row">
          <button
            type="submit"
            className="btn btn-danger"
            disabled={!matches || pending}
          >
            Delete permanently
          </button>
          <Link href={cancelHref} className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
