import Link from "next/link";
import { useId } from "react";

// The server-rendered second step for a destructive action (?confirm=...).
// No client state: the page renders this when the confirm value is present.

export type ConfirmPanelProps = {
  heading: string;
  /** One plain-English sentence on what will happen. */
  consequence: string;
  /** Server action the form posts to. */
  action: (formData: FormData) => void | Promise<void>;
  /** Label of the destructive submit button. */
  confirmLabel: string;
  /** The page's address without the confirm query value. */
  cancelHref: string;
  /** Values the action needs, sent as hidden inputs. */
  hiddenFields?: Record<string, string>;
  /** Makes the person type something (the name) before the action runs. */
  typeToConfirm?: { label: string };
};

export function ConfirmPanel({
  heading,
  consequence,
  action,
  confirmLabel,
  cancelHref,
  hiddenFields = {},
  typeToConfirm,
}: ConfirmPanelProps) {
  const id = useId();
  const headingId = `${id}-heading`;
  const inputId = `${id}-confirmation`;
  return (
    <div
      className="alert alert-error stack-sm"
      role="alertdialog"
      aria-labelledby={headingId}
    >
      <h2 className="card-t" id={headingId}>
        {heading}
      </h2>
      <p>{consequence}</p>
      <form action={action} className="stack-sm">
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {typeToConfirm ? (
          <div className="field">
            <label htmlFor={inputId}>{typeToConfirm.label}</label>
            <input
              id={inputId}
              type="text"
              name="confirmation"
              required
              autoComplete="off"
            />
          </div>
        ) : null}
        <div className="row">
          <button type="submit" className="btn btn-danger">
            {confirmLabel}
          </button>
          <Link href={cancelHref} className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
