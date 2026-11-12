import { AccessDenied } from "@/components/admin/AccessDenied";
import { SettingsView } from "@/components/admin/SettingsView";
import { loadEventOptions } from "@/lib/admin/data/households";
import { loadSettings, loadStaff } from "@/lib/admin/data/settings";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";
import { loadSaveTheDate } from "@/lib/calendar/load";
import { destinationFor, withDestination } from "@/lib/auth/destination";
import { textSegments } from "@/lib/campaigns/send-window";
import { renderText } from "@/lib/sms/texts";
import { isSmsConfigured } from "@/lib/sms/state";

export default async function SettingsPage() {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const [settings, staff, events] = await Promise.all([
    loadSettings(session.supabase),
    loadStaff(session.supabase),
    loadEventOptions(session.supabase),
  ]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const card = await loadSaveTheDate(session.supabase, siteUrl).catch(
    () => null,
  );
  let textPreview: string | null = null;
  try {
    const base = (siteUrl || "https://hannahandchris.wedding").replace(
      /\/+$/,
      "",
    );
    textPreview = renderText("save_the_date", {
      personal_link: withDestination(
        `${base}/i/${"x".repeat(22)}.${"x".repeat(43)}`,
        destinationFor("save_the_date"),
      ),
    });
  } catch {
    textPreview = null;
  }
  return (
    <SettingsView
      role={session.role}
      currentUserId={session.user.id}
      settings={settings}
      events={events}
      staff={staff}
      smsConfigured={isSmsConfigured()}
      saveTheDate={
        card
          ? {
              date: card.date,
              place: card.place ?? "",
              note: card.note ?? "",
              coupleNames: card.couple_names,
              textPreview,
              textSegments: textPreview ? textSegments(textPreview) : null,
            }
          : undefined
      }
    />
  );
}
