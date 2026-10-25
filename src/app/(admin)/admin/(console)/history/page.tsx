import { AccessDenied } from "@/components/admin/AccessDenied";
import { HistoryView, type HistoryTab } from "@/components/admin/HistoryView";
import {
  loadChangeLog,
  loadMealHistory,
  loadRsvpHistory,
  loadStaffOptions,
} from "@/lib/admin/data/history";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

const TABS: HistoryTab[] = ["log", "rsvp", "meals"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const params = await searchParams;
  const { supabase } = session;

  const tab = TABS.find((t) => t === first(params.tab)) ?? "log";
  const filters = {
    from: first(params.from),
    to: first(params.to),
    by: first(params.by) || "anyone",
  };
  const query = { ...filters, page: Number(first(params.page)) || 1 };
  const staffOptions = await loadStaffOptions(supabase);

  return (
    <HistoryView
      tab={tab}
      filters={filters}
      staffOptions={staffOptions}
      log={tab === "log" ? await loadChangeLog(supabase, query) : undefined}
      rsvp={tab === "rsvp" ? await loadRsvpHistory(supabase, query) : undefined}
      meals={
        tab === "meals" ? await loadMealHistory(supabase, query) : undefined
      }
    />
  );
}
