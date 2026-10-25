import type { ReactNode } from "react";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { ConsoleShell } from "@/components/admin/ConsoleShell";
import { signOut } from "@/lib/admin/actions/session";
import {
  getShellStaff,
  isForbidden,
  requireStaffPage,
} from "@/lib/admin/session";

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  // A signed-out visitor is redirected to the sign-in page by this call.
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const staff = await getShellStaff(session.supabase);
  if (!staff) return <AccessDenied />;
  return (
    <ConsoleShell staff={staff} signOutAction={signOut}>
      {children}
    </ConsoleShell>
  );
}
