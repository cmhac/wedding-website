import Link from "next/link";
import { Children, cloneElement, isValidElement } from "react";
import type { ReactNode } from "react";

// Presentational building blocks for the admin console. They use the semantic
// class names from admin.css only; no utility classes, no inline styles.

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-sub">{description}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Card({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {heading ? (
        <div className="card-h">
          <h2 className="card-t">{heading}</h2>
        </div>
      ) : null}
      <div className="card-b">{children}</div>
    </section>
  );
}

export function StatTile({
  value,
  label,
}: {
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="stat">
      <span className="stat-n">{value}</span>
      <span className="stat-l">{label}</span>
    </div>
  );
}

export type BadgeVariant = "default" | "ok" | "warn" | "bad" | "staff";

export function Badge({
  variant = "default",
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  const className = variant === "default" ? "badge" : `badge badge-${variant}`;
  return <span className={className}>{children}</span>;
}

export type AlertVariant = "error" | "ok" | "warn" | "info";

export function Alert({
  variant,
  children,
}: {
  variant: AlertVariant;
  children: ReactNode;
}) {
  return (
    <div
      className={`alert alert-${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  /** The control. It must have the same `id`; Field wires up the description. */
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <FieldControl
        describedBy={describedBy || undefined}
        invalid={Boolean(error)}
      >
        {children}
      </FieldControl>
      {hint ? (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="hint field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FieldControl({
  describedBy,
  invalid,
  children,
}: {
  describedBy?: string;
  invalid: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {Children.map(children, (child) =>
        isValidElement<Record<string, unknown>>(child)
          ? cloneElement(child, {
              ...(describedBy ? { "aria-describedby": describedBy } : {}),
              ...(invalid ? { "aria-invalid": true } : {}),
            })
          : child,
      )}
    </>
  );
}

export function TabLinks({
  label,
  basePath,
  param,
  tabs,
  current,
  query = {},
}: {
  label: string;
  basePath: string;
  /** The query parameter that holds the selected tab. */
  param: string;
  tabs: { value: string; label: string }[];
  current: string;
  /** Other query values to keep in every link. */
  query?: Record<string, string | undefined>;
}) {
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((tab) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
          if (key !== param && value !== undefined && value !== "") {
            search.set(key, value);
          }
        }
        search.set(param, tab.value);
        return (
          <Link
            key={tab.value}
            className="tab"
            href={`${basePath}?${search.toString()}`}
            aria-current={tab.value === current ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
