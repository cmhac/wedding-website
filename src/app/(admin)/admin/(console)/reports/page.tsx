import { AccessDenied } from "@/components/admin/AccessDenied";
import { ReportsView, type ReportTab } from "@/components/admin/ReportsView";
import {
  loadDietaryList,
  loadDishTotals,
  loadEventOptions,
  loadMealConflicts,
} from "@/lib/admin/data/reports";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

const TABS: ReportTab[] = ["dish", "diet", "conflicts", "exports"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const params = await searchParams;
  const { supabase } = session;

  const events = await loadEventOptions(supabase);
  const requested = first(params.event);
  const eventSlug =
    events.find((e) => e.slug === requested)?.slug ?? events[0]?.slug ?? "";
  const tab = TABS.find((t) => t === first(params.tab)) ?? "dish";

  const [dish, diet, conflicts] = await Promise.all([
    loadDishTotals(supabase, eventSlug),
    loadDietaryList(supabase, eventSlug),
    loadMealConflicts(supabase, eventSlug),
  ]);
  return (
    <ReportsView
      tab={tab}
      eventSlug={eventSlug}
      events={events}
      dish={dish}
      diet={diet}
      conflicts={conflicts}
    />
  );
}
