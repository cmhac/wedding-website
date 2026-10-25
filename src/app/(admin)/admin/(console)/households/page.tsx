import { AccessDenied } from "@/components/admin/AccessDenied";
import { DuplicatesView } from "@/components/admin/DuplicatesView";
import { HouseholdsListView } from "@/components/admin/HouseholdsListView";
import {
  loadDuplicates,
  loadEventOptions,
  loadHouseholdList,
  parseHouseholdQuery,
} from "@/lib/admin/data/households";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HouseholdsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const { query, duplicates } = parseHouseholdQuery(await searchParams);
  const [pairs, list, events] = await Promise.all([
    loadDuplicates(session.supabase),
    loadHouseholdList(query, session.supabase),
    loadEventOptions(session.supabase),
  ]);
  if (duplicates) {
    return (
      <DuplicatesView
        pairs={pairs}
        description={`${list.totalAll} households, ${list.totalGuests} guests`}
      />
    );
  }
  return (
    <HouseholdsListView
      list={list}
      query={query}
      events={events}
      duplicateCount={pairs.length}
    />
  );
}
