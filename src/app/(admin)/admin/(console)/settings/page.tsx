import { AccessDenied } from "@/components/admin/AccessDenied";
import { SettingsView } from "@/components/admin/SettingsView";
import { loadSettings, loadStaff } from "@/lib/admin/data/settings";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

export default async function SettingsPage() {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const [settings, staff] = await Promise.all([
    loadSettings(session.supabase),
    loadStaff(session.supabase),
  ]);
  return (
    <SettingsView
      role={session.role}
      currentUserId={session.user.id}
      settings={settings}
      staff={staff}
    />
  );
}
