"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { sendTestCampaign } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert, Field } from "../primitives";

/**
 * "Send a test": a rehearsal of this message to one household, through the same
 * path and wording as the real send. It is labelled a test and does not count
 * as the real send. Repeat it for each household you want to try.
 */
export function SendTestForm({
  messageTypeKey,
  channel,
  households,
}: {
  messageTypeKey: string;
  channel: "email" | "text" | "both";
  households: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId) {
      setOutcome({ kind: "error", text: "Choose a household for the test." });
      return;
    }
    setPending(true);
    setOutcome(null);
    const result = await sendTestCampaign({
      message_type_key: messageTypeKey,
      channel,
      household_id: householdId,
    });
    setPending(false);
    if (result.ok) {
      const { sent, queued, failed } = result.data;
      setOutcome({
        kind: "ok",
        text: `Test sent: ${sent} sent, ${queued} still queued, ${failed} failed. It does not count as the real send.`,
      });
      router.refresh();
    } else {
      setOutcome({ kind: "error", text: messageFor(result.error.code) });
    }
  }

  return (
    <form className="stack-sm" onSubmit={onSubmit} noValidate>
      {outcome ? (
        <Alert variant={outcome.kind === "ok" ? "ok" : "error"}>
          {outcome.text}
        </Alert>
      ) : null}
      <Field
        id="send-test-household"
        label="Send the test to"
        hint="One household. It uses this campaign's message and channel, and does not count as the real send."
      >
        <select
          id="send-test-household"
          value={householdId}
          onChange={(e) => setHouseholdId(e.target.value)}
        >
          <option value="">Choose a household</option>
          {households.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="row">
        <button type="submit" className="btn" disabled={pending}>
          Send a test
        </button>
      </div>
    </form>
  );
}
