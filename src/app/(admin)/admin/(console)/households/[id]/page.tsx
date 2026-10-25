import { AccessDenied } from "@/components/admin/AccessDenied";
import { AnswersView } from "@/components/admin/AnswersView";
import { HouseholdDetailView } from "@/components/admin/HouseholdDetailView";
import { Card, PageHeader } from "@/components/admin/primitives";
import {
  inviteGuests,
  recordMeal,
  recordRsvp,
} from "@/lib/admin/actions/answers";
import { answersTabProps } from "@/lib/admin/answers-tab";
import { loadHouseholdAnswers } from "@/lib/admin/data/answers";
import { loadEvents } from "@/lib/admin/data/events";
import { loadHouseholdDetail } from "@/lib/admin/data/households";
import { messageFor } from "@/lib/admin/messages";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function HouseholdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const household = await loadHouseholdDetail(id, session.supabase);
  if (!household) {
    return (
      <>
        <PageHeader title="Household not found" />
        <Card>
          <p>{messageFor("not_found")}</p>
        </Card>
      </>
    );
  }
  const [rows, events] = await Promise.all([
    loadHouseholdAnswers(id, session.supabase),
    loadEvents(session.supabase),
  ]);
  const { guestIds, otherEvents } = answersTabProps({
    rows,
    guests: household.guests,
    events,
  });
  return (
    <HouseholdDetailView
      household={household}
      tab={first(query.tab) ?? "details"}
      guest={first(query.guest)}
      confirm={first(query.confirm)}
      notice={first(query.notice)}
      extraTabs={[
        {
          value: "answers",
          label: "Answers",
          body: (
            <AnswersView
              rows={rows}
              guestIds={guestIds}
              otherEvents={otherEvents}
              actions={{ recordRsvp, recordMeal, inviteGuests }}
            />
          ),
        },
      ]}
    />
  );
}
