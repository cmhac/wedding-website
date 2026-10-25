"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { importGuestsFile } from "@/lib/admin-api/client";
import { ImportResultView, type ImportOutcome } from "../ImportResultView";
import { Card, Field } from "../primitives";

/**
 * Uploads through the route handler (not a server action), so the result is
 * held in component state.
 */
export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    setPending(true);
    setOutcome(null);
    const result = await importGuestsFile(file);
    setOutcome(
      result.ok
        ? { ok: true, fileName: file.name, data: result.data }
        : { ok: false, message: result.error.message },
    );
    setPending(false);
  }

  return (
    <div className="stack">
      <Card heading="1. Choose a file">
        <form className="row-end" onSubmit={submit}>
          <div className="field-grow">
            <Field
              id="import-file"
              label="File (.csv or .xlsx)"
              hint="CSV and Excel use the same columns. Excel files: the first sheet is read, and the result says which. A household with any bad row is skipped whole; the rest are still created."
            >
              <input
                id="import-file"
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!file || pending}
          >
            Import file
          </button>
        </form>
      </Card>
      {outcome ? <ImportResultView outcome={outcome} /> : null}
    </div>
  );
}
