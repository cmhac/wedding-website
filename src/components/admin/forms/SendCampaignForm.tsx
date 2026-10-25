"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendCampaign } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { ConfirmPanel } from "../ConfirmPanel";
import { Alert } from "../primitives";

export type SendCampaignFormProps = {
  campaignId: string;
  /** Where "Go back" leads (the page without the confirm step). */
  backHref: string;
  /** How many households will be emailed, when known. */
  recipientCount?: number;
  /** Open at the confirm step (the page was reached with confirm=send). */
  startConfirmed?: boolean;
};

type Outcome =
  { kind: "sent"; text: string } | { kind: "refused"; text: string };

export function SendCampaignForm({
  campaignId,
  backHref,
  recipientCount,
  startConfirmed = false,
}: SendCampaignFormProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(startConfirmed);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function confirm() {
    const result = await sendCampaign(campaignId);
    if (result.ok) {
      const { sent, queued, skipped, failed } = result.data;
      const skippedTotal = skipped.no_email + skipped.opted_out + skipped.other;
      setOutcome({
        kind: "sent",
        text: `Done. ${sent} sent, ${queued} still queued, ${skippedTotal} skipped, ${failed} failed.`,
      });
      router.refresh();
    } else {
      setOutcome({
        kind: "refused",
        text: `${messageFor(result.error.code)} Nothing was sent.`,
      });
    }
    setConfirming(false);
  }

  if (outcome?.kind === "sent") {
    return (
      <div className="stack-sm">
        <Alert variant="ok">{outcome.text}</Alert>
        <Link
          className="btn"
          href={`/admin/campaigns?tab=delivery&id=${encodeURIComponent(campaignId)}`}
        >
          View delivery
        </Link>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      {outcome?.kind === "refused" ? (
        <Alert variant="error">{outcome.text}</Alert>
      ) : null}
      {confirming ? (
        // The panel's Cancel is a link; leaving it should also close the step.
        <div
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest("a"))
              setConfirming(false);
          }}
        >
          <ConfirmPanel
            heading={
              recipientCount === undefined
                ? "Send this campaign now?"
                : `Send to ${recipientCount} ${recipientCount === 1 ? "household" : "households"} now?`
            }
            consequence="Emails go out straight away and cannot be unsent. A sent campaign can no longer be edited."
            action={confirm}
            confirmLabel="Send now"
            cancelHref={backHref}
          />
        </div>
      ) : (
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setConfirming(true)}
          >
            Send now
          </button>
        </div>
      )}
    </div>
  );
}
