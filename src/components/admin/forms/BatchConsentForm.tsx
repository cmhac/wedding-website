"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { setBatchConsent } from "@/lib/admin-api/client";
import { messageFor } from "@/lib/admin/messages";
import { Alert, Field } from "../primitives";

/** The id the table's row checkboxes point at with their `form` attribute. */
export const BATCH_FORM_ID = "batch-consent";

/** The most households one batch may cover (the route's limit). */
const MAX_BATCH = 1000;

type Counts = {
  marked: number;
  cleared: number;
  already: number;
  declined_skipped: number;
  households_without_phone: number;
  households: number;
};

type Stage =
  | { kind: "choose" }
  | { kind: "review"; ids: string[]; counts: Counts }
  | { kind: "done"; counts: Counts };

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The household list's batch edit (research R11): choose households (the ones
 * checked in the table, or every household matching the filter), choose an
 * action, review what would change, confirm. Nothing changes until Confirm.
 * The first actions mark or clear text consent; marking sends no text.
 */
export function BatchConsentForm({ matchingIds }: { matchingIds: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [mode, setMode] = useState<"mark" | "clear">("mark");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chosenIds(): string[] {
    if (scope === "all") return matchingIds;
    const data = new FormData(formRef.current ?? undefined);
    return data.getAll("household").map(String);
  }

  async function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const ids = chosenIds();
    if (ids.length === 0) {
      setError("Choose at least one household.");
      return;
    }
    if (ids.length > MAX_BATCH) {
      setError(
        `A batch can cover ${MAX_BATCH} households at most. Narrow the filter or choose fewer.`,
      );
      return;
    }
    setPending(true);
    const result = await setBatchConsent({
      household_ids: ids,
      mode,
      note: note.trim(),
      override_declined: override,
      dry_run: true,
    });
    setPending(false);
    if (!result.ok) {
      setError(messageFor(result.error.code));
      return;
    }
    setStage({ kind: "review", ids, counts: result.data.counts });
  }

  async function onConfirm(ids: string[]) {
    setError(null);
    setPending(true);
    const result = await setBatchConsent({
      household_ids: ids,
      mode,
      note: note.trim(),
      override_declined: override,
      dry_run: false,
    });
    setPending(false);
    if (!result.ok) {
      setError(messageFor(result.error.code));
      return;
    }
    setStage({ kind: "done", counts: result.data.counts });
    router.refresh();
  }

  const reset = () => {
    setStage({ kind: "choose" });
    setError(null);
  };

  return (
    <form
      id={BATCH_FORM_ID}
      ref={formRef}
      className="stack-sm"
      onSubmit={onReview}
      noValidate
    >
      <h2 className="h3">Batch edit</h2>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {stage.kind === "choose" ? (
        <>
          <div className="row-end">
            <div className="field">
              <label htmlFor="batch-scope">Households</label>
              <select
                id="batch-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as "selected" | "all")}
              >
                <option value="selected">Checked in the table</option>
                <option value="all">
                  Every household matching the filter ({matchingIds.length})
                </option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="batch-mode">Action</label>
              <select
                id="batch-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "mark" | "clear")}
              >
                <option value="mark">Mark phone numbers as consented</option>
                <option value="clear">Clear consent mark</option>
              </select>
            </div>
          </div>
          {mode === "mark" ? (
            <Field
              id="batch-note"
              label="Where the consent came from"
              hint="Optional, for your own reference. Marking sends no text: the first message does the confirming."
            >
              <input
                id="batch-note"
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          ) : null}
          <div className="row">
            <button type="submit" className="btn" disabled={pending}>
              Review
            </button>
          </div>
        </>
      ) : null}
      {stage.kind === "review" ? (
        <div className="alert alert-warn stack-sm" role="group">
          <p>
            {mode === "mark"
              ? `${plural(stage.counts.marked, "number", "numbers")} will be marked`
              : `${plural(stage.counts.cleared, "number", "numbers")} will be cleared`}{" "}
            across {plural(stage.counts.households, "household", "households")}.
          </p>
          <ul className="plain">
            {mode === "mark" ? (
              <li>{stage.counts.already} already consented</li>
            ) : (
              <li>{stage.counts.already} not asked, left alone</li>
            )}
            {mode === "mark" && stage.counts.declined_skipped > 0 ? (
              <li>
                {stage.counts.declined_skipped} declined at the site (skipped
                unless you tick the box below)
              </li>
            ) : null}
            <li>
              {plural(
                stage.counts.households_without_phone,
                "household has",
                "households have",
              )}{" "}
              no phone number
            </li>
          </ul>
          {mode === "mark" && stage.counts.declined_skipped > 0 ? (
            <label className="check">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
              />{" "}
              Also mark numbers that declined at the site
            </label>
          ) : null}
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => onConfirm(stage.ids)}
            >
              Confirm
            </button>
            <button type="button" className="btn" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {stage.kind === "done" ? (
        <div className="stack-sm">
          <Alert variant="ok">
            {mode === "mark"
              ? `Done: ${plural(stage.counts.marked, "number", "numbers")} marked.`
              : `Done: ${plural(stage.counts.cleared, "number", "numbers")} cleared.`}{" "}
            Nothing was sent.
          </Alert>
          <div className="row">
            <button type="button" className="btn" onClick={reset}>
              Start another
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
