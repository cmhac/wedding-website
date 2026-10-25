import Link from "next/link";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { ConfirmPanel } from "@/components/admin/ConfirmPanel";
import { EventForm } from "@/components/admin/EventForm";
import { EventsListView } from "@/components/admin/EventsListView";
import { InviteView } from "@/components/admin/InviteView";
import {
  Alert,
  EmptyState,
  PageHeader,
  TabLinks,
} from "@/components/admin/primitives";
import { inviteGuests } from "@/lib/admin/actions/answers";
import { confirmDeleteEvent, saveEvent } from "@/lib/admin/actions/events";
import {
  loadEvent,
  loadEvents,
  loadInvitableGuests,
} from "@/lib/admin/data/events";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const NOTICES: Record<string, { variant: "ok" | "error"; text: string }> = {
  deleted: { variant: "ok", text: "The event was deleted." },
  delete_failed: {
    variant: "error",
    text: "That event could not be deleted. It may already be gone.",
  },
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const { supabase } = session;

  const params = await searchParams;
  const events = await loadEvents(supabase);
  const tabs = [
    { value: "list", label: `All events (${events.length})` },
    { value: "edit", label: "Add or edit event" },
    { value: "invite", label: "Invite guests" },
  ];
  const requested = first(params.tab);
  const tab = tabs.some((t) => t.value === requested) ? requested : "list";
  const id = first(params.id);
  const notice = NOTICES[first(params.notice) ?? ""];

  return (
    <div className="stack">
      <PageHeader
        title="Events"
        description="All times are Pacific time (PT)."
        actions={
          <Link href="/admin/events?tab=edit" className="btn btn-primary">
            New event
          </Link>
        }
      />
      {notice ? <Alert variant={notice.variant}>{notice.text}</Alert> : null}
      <TabLinks
        label="Event sections"
        basePath="/admin/events"
        param="tab"
        tabs={tabs}
        current={tab ?? "list"}
      />

      {tab === "list" ? <EventsListView events={events} /> : null}

      {tab === "edit" ? await editTab() : null}

      {tab === "invite" ? await inviteTab() : null}
    </div>
  );

  async function editTab() {
    if (!id) {
      const nextOrder =
        events.reduce((m, e) => Math.max(m, e.displayOrder), 0) + 1;
      return <EventForm action={saveEvent} nextOrder={nextOrder} />;
    }
    const event = await loadEvent(id, supabase);
    if (!event) {
      return (
        <EmptyState>
          That event could not be found. It may have been deleted.
        </EmptyState>
      );
    }
    return (
      <div className="stack">
        <EventForm action={saveEvent} event={event} />
        {first(params.confirm) === "delete" ? (
          <ConfirmPanel
            heading={`Delete ${event.name}?`}
            consequence={`This also removes its ${event.invited} ${
              event.invited === 1 ? "invitation" : "invitations"
            }, with their answers and meal choices, and its menu. This cannot be undone.`}
            action={confirmDeleteEvent}
            confirmLabel="Delete event"
            cancelHref={`/admin/events?tab=edit&id=${encodeURIComponent(event.id)}`}
            hiddenFields={{ id: event.id, confirmed: "yes" }}
          />
        ) : (
          <section className="danger-zone">
            <div className="card-b">
              <Link
                href={`/admin/events?tab=edit&id=${encodeURIComponent(event.id)}&confirm=delete`}
                className="btn btn-danger"
              >
                Delete {event.name}
              </Link>
            </div>
          </section>
        )}
      </div>
    );
  }

  async function inviteTab() {
    const eventId = events.find((e) => e.id === id)?.id ?? events[0]?.id ?? "";
    const q = first(params.q) ?? "";
    const guests = eventId
      ? await loadInvitableGuests(q, eventId, supabase)
      : [];
    return (
      <InviteView
        action={inviteGuests}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        eventId={eventId}
        q={q}
        guests={guests}
      />
    );
  }
}
