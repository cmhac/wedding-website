import { AccessDenied } from "@/components/admin/AccessDenied";
import { OverviewView } from "@/components/admin/OverviewView";
import { loadOverview } from "@/lib/admin/data/overview";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

export default async function OverviewPage() {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  return <OverviewView data={await loadOverview(session.supabase)} />;
}
