import type { ReactNode } from "react";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { ConsoleShell } from "@/components/admin/ConsoleShell";
import { SetupGuide, type SetupActions } from "@/components/admin/SetupGuide";
import { saveSmsSwitch } from "@/lib/admin/actions/settings";
import {
  checkAgain,
  confirmStep,
  leaveGuide,
  recordPosition,
  restartGuide,
  resumeGuide,
  saveSetupValue,
  skipStep,
  unconfirmStep,
} from "@/lib/admin/actions/setup";
import { signOut } from "@/lib/admin/actions/session";
import {
  getShellStaff,
  isForbidden,
  requireStaffPage,
} from "@/lib/admin/session";
import { loadSetup } from "@/lib/setup/load";

const setupActions: SetupActions = {
  leave: leaveGuide,
  resume: resumeGuide,
  skip: skipStep,
  restart: restartGuide,
  recordPosition,
  confirm: confirmStep,
  unconfirm: unconfirmStep,
  checkAgain,
  saveValue: saveSetupValue,
  saveSmsSwitch: saveSmsSwitch as SetupActions["saveSmsSwitch"],
};

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
  // Null when the status cannot be read: the page then shows no banner.
  const setup = await loadSetup(
    session.supabase,
    session.user.id,
    session.role,
  );
  return (
    <ConsoleShell
      staff={staff}
      signOutAction={signOut}
      banner={
        setup ? <SetupGuide view={setup} actions={setupActions} /> : undefined
      }
      setup={
        setup
          ? {
              requiredOpen: setup.requiredOpen,
              recommendedOpen: setup.recommendedOpen,
            }
          : undefined
      }
    >
      {children}
    </ConsoleShell>
  );
}
