"use client";

import { useState } from "react";
import { getInviteLink, reissueInviteLink } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert } from "./primitives";

/**
 * Copy a household's personal invite link, or reissue it. Reissuing stops the
 * old link at once, so it asks first and says the new link must be sent. If the
 * browser will not copy, the link is shown to select by hand.
 */
export function InviteLinkControls({ householdId }: { householdId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  async function deliver(url: string, done: string) {
    setShown(null);
    try {
      await navigator.clipboard.writeText(url);
      setNotice(done);
    } catch {
      setShown(url);
      setNotice("Copy this link by hand:");
    }
  }

  async function copy() {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await getInviteLink(householdId);
    setPending(false);
    if (!result.ok) return setError(messageFor(result.error.code));
    await deliver(result.data.url, "Personal link copied.");
  }

  async function reissue() {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await reissueInviteLink(householdId);
    setPending(false);
    setConfirming(false);
    if (!result.ok) return setError(messageFor(result.error.code));
    await deliver(
      result.data.url,
      "New personal link issued and copied. The old link no longer works: send the new one.",
    );
  }

  return (
    <div className="stack-sm">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="ok">{notice}</Alert> : null}
      {shown ? (
        <input
          type="text"
          readOnly
          aria-label="Personal link"
          value={shown}
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
      <div className="row">
        <button type="button" className="btn" disabled={pending} onClick={copy}>
          Copy personal link
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          Reissue link
        </button>
      </div>
      {confirming ? (
        <div className="alert alert-warn stack-sm" role="alertdialog">
          <p>
            Reissue this household&apos;s link? The old link stops working at
            once, and the new link must be sent to the household.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={reissue}
            >
              Reissue and copy
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
