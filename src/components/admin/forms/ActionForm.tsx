"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
// Type-only: erased at build time, so nothing from the server-only module
// reaches the client bundle.
import type { ActionResult, FormValues } from "@/lib/admin/actions/shared";
import { Alert } from "../primitives";

/** What a form's children get to read after each submission. */
export type ActionFormState = {
  /** Plain-English message per field name, empty until a failure. */
  fieldErrors: Record<string, string>;
  /** What was typed, to pass as `defaultValue`; empty until a failure. */
  values: FormValues;
  pending: boolean;
};

export type ActionFormProps = {
  /** A server action taking the previous result and the form data. */
  action: (
    previous: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  /** Label of the submit button. */
  submitLabel: string;
  /** Shown in a status alert when the action returns ok. */
  successMessage?: string;
  /** Fields, or a function of the latest state that returns them. */
  children: ReactNode | ((state: ActionFormState) => ReactNode);
};

const NO_ERRORS: Record<string, string> = {};
const NO_VALUES: FormValues = {};

export function ActionForm({
  action,
  submitLabel,
  successMessage,
  children,
}: ActionFormProps) {
  const [result, formAction, pending] = useActionState(action, null);
  const failed = result && !result.ok ? result : null;
  const state: ActionFormState = {
    fieldErrors: failed?.fieldErrors ?? NO_ERRORS,
    values: failed?.values ?? NO_VALUES,
    pending,
  };

  return (
    <form action={formAction} className="stack-sm">
      {failed ? <Alert variant="error">{failed.message}</Alert> : null}
      {result?.ok && successMessage ? (
        <Alert variant="ok">{successMessage}</Alert>
      ) : null}
      {typeof children === "function" ? children(state) : children}
      <div className="row">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          aria-disabled={pending}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
