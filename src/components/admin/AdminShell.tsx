import Link from "next/link";
import type { ReactNode } from "react";

// The console frame: sidebar on wide screens, a top bar with a <details> menu
// on phones. Both are in the markup; admin.css shows one. No client state.

export type NavKey =
  | "overview"
  | "households"
  | "import"
  | "events"
  | "menus"
  | "campaigns"
  | "reports"
  | "history"
  | "settings";

const NAV_GROUPS: {
  heading: string;
  items: { key: NavKey; label: string; href: string }[];
}[] = [
  {
    heading: "Guests",
    items: [
      { key: "overview", label: "Overview", href: "/admin" },
      { key: "households", label: "Households", href: "/admin/households" },
      { key: "import", label: "Import", href: "/admin/import" },
    ],
  },
  {
    heading: "Events",
    items: [
      { key: "events", label: "Events", href: "/admin/events" },
      { key: "menus", label: "Menus", href: "/admin/menus" },
    ],
  },
  {
    heading: "Communicate",
    items: [{ key: "campaigns", label: "Campaigns", href: "/admin/campaigns" }],
  },
  {
    heading: "Insights",
    items: [
      { key: "reports", label: "Reports", href: "/admin/reports" },
      { key: "history", label: "History", href: "/admin/history" },
    ],
  },
  {
    heading: "Admin",
    items: [{ key: "settings", label: "Settings", href: "/admin/settings" }],
  },
];

const ROLE_LABELS = { couple: "Couple", planner: "Planner" } as const;

export type AdminShellProps = {
  /** Which page is showing; its link gets aria-current="page". */
  current: NavKey;
  staff: { displayName: string; role: keyof typeof ROLE_LABELS };
  /** Server action the Sign out form posts to. */
  signOutAction: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
};

function NavLinks({ current }: { current: NavKey }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="nav-group">
          <p className="nav-h">{group.heading}</p>
          {group.items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

function Who({
  staff,
  signOutAction,
}: Pick<AdminShellProps, "staff" | "signOutAction">) {
  return (
    <div className="who">
      <strong>{staff.displayName}</strong>
      <span className="muted small">{ROLE_LABELS[staff.role]}</span>
      <form action={signOutAction}>
        <button type="submit" className="btn btn-quiet btn-sm">
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AdminShell({
  current,
  staff,
  signOutAction,
  children,
}: AdminShellProps) {
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <div>
            <strong>Wedding admin</strong>
            <div className="muted small">v0 test console</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLinks current={current} />
        </nav>
        <Who staff={staff} signOutAction={signOutAction} />
      </aside>

      <header className="m-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span className="m-title">Wedding admin</span>
        </div>
        <details className="m-menu">
          <summary className="btn" role="button">
            Menu
          </summary>
          <nav className="m-drawer" aria-label="Main menu">
            <NavLinks current={current} />
            <Who staff={staff} signOutAction={signOutAction} />
          </nav>
        </details>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
