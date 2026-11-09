"use client";

import { useState } from "react";
import { signOutHousehold } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert } from "../primitives";

/** Signs a household out on every device, after a confirmation. */
export function SignOutEverywhereForm({
  householdId,
}: {
  householdId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function signOut() {
    setPending(true);
    setError(null);
    const result = await signOutHousehold(householdId);
    setPending(false);
    setConfirming(false);
    if (result.ok) setDone(true);
    else setError(messageFor(result.error.code));
  }

  return (
    <div className="stack-sm">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {done ? (
        <Alert variant="ok">
          Signed out everywhere. They can sign in again with their personal link
          or an email address.
        </Alert>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            setDone(false);
            setConfirming(true);
          }}
        >
          Sign out everywhere
        </button>
      </div>
      {confirming ? (
        <div className="alert alert-warn stack-sm" role="alertdialog">
          <p>
            Sign this household out on every device? They lose access on their
            next request and need their personal link or a sign-in email to get
            back in.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={signOut}
            >
              Sign out on every device
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
