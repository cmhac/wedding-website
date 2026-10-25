"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
// Type-only: erased at build time, so nothing from the server-only module
// reaches the client bundle.
import type { ActionResult, FormValues } from "@/lib/admin/actions/shared";
import { Alert } from "../primitives";

/** What a form's children get to read after each submission. */
export type ResultFormState = {
  fieldErrors: Record<string, string>;
  values: FormValues;
  pending: boolean;
};

export type ResultFormProps<T extends { message?: string }> = {
  action: (
    previous: ActionResult<T> | null,
    formData: FormData,
  ) => Promise<ActionResult<T>>;
  submitLabel: string;
  /** Names the button for screen readers when the label alone is not unique. */
  submitAriaLabel?: string;
  /** Shown on success when the action returns no message of its own. */
  successMessage?: string;
  /** Put the controls and the button on one line (for a row in a table). */
  inline?: boolean;
  /** Shown beside the submit button, for example a Cancel link. */
  secondary?: ReactNode;
  children: ReactNode | ((state: ResultFormState) => ReactNode);
};

const NO_ERRORS: Record<string, string> = {};
const NO_VALUES: FormValues = {};

/**
 * Like ActionForm, but shows the action's own success sentence
 * (`data.message`) and can name its button, so a screen can hold many forms.
 */
export function ResultForm<T extends { message?: string }>({
  action,
  submitLabel,
  submitAriaLabel,
  successMessage,
  inline = false,
  secondary,
  children,
}: ResultFormProps<T>) {
  const [result, formAction, pending] = useActionState<
    ActionResult<T> | null,
    FormData
  >(action, null);
  const failed = result && !result.ok ? result : null;
  const state: ResultFormState = {
    fieldErrors: failed?.fieldErrors ?? NO_ERRORS,
    values: failed?.values ?? NO_VALUES,
    pending,
  };
  const okMessage = result?.ok
    ? (result.data?.message ?? successMessage)
    : undefined;

  const controls = typeof children === "function" ? children(state) : children;
  const button = (
    <button
      type="submit"
      className="btn btn-primary btn-sm"
      aria-label={submitAriaLabel}
      disabled={pending}
      aria-disabled={pending}
    >
      {submitLabel}
    </button>
  );

  return (
    <form action={formAction} className="stack-sm">
      {failed ? <Alert variant="error">{failed.message}</Alert> : null}
      {okMessage ? <Alert variant="ok">{okMessage}</Alert> : null}
      {inline ? (
        <div className="row">
          {controls}
          {button}
          {secondary}
        </div>
      ) : (
        <>
          {controls}
          <div className="row">
            {button}
            {secondary}
          </div>
        </>
      )}
    </form>
  );
}
