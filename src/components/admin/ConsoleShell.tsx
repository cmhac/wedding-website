"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell, type AdminShellProps, type NavKey } from "./AdminShell";

const SECTIONS: NavKey[] = [
  "households",
  "import",
  "events",
  "menus",
  "campaigns",
  "reports",
  "history",
  "settings",
];

/** Which navigation link a path belongs to; the overview is the fallback. */
export function navKeyFor(pathname: string | null): NavKey {
  const section = pathname?.split("/").filter(Boolean)[1];
  return SECTIONS.find((key) => key === section) ?? "overview";
}

/**
 * The shell with its current link worked out from the URL. A layout cannot
 * see the path, so this small client wrapper does it.
 */
export function ConsoleShell({
  staff,
  signOutAction,
  children,
}: Omit<AdminShellProps, "current"> & { children: ReactNode }) {
  return (
    <AdminShell
      current={navKeyFor(usePathname())}
      staff={staff}
      signOutAction={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
