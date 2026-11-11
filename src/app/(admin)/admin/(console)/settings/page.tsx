import { AccessDenied } from "@/components/admin/AccessDenied";
import { SettingsView } from "@/components/admin/SettingsView";
import { loadEventOptions } from "@/lib/admin/data/households";
import { loadSettings, loadStaff } from "@/lib/admin/data/settings";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";
import { isSmsConfigured } from "@/lib/sms/state";

export default async function SettingsPage() {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const [settings, staff, events] = await Promise.all([
    loadSettings(session.supabase),
    loadStaff(session.supabase),
    loadEventOptions(session.supabase),
  ]);
  return (
    <SettingsView
      role={session.role}
      currentUserId={session.user.id}
      settings={settings}
      events={events}
      staff={staff}
      smsConfigured={isSmsConfigured()}
    />
  );
}
