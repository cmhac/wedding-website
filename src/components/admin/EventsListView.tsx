import Link from "next/link";
import type { EventRow } from "@/lib/admin/data/events";
import { DataTable, type Column } from "./DataTable";
import { Badge } from "./primitives";

const columns: Column<EventRow>[] = [
  {
    key: "order",
    header: "Order",
    numeric: true,
    cell: (e) => String(e.displayOrder),
  },
  {
    key: "event",
    header: "Event",
    cell: (e) => (
      <>
        <strong>{e.name}</strong>
        <div className="table-sub">
          {e.groupKey ? `${e.slug} · ${e.groupKey}` : e.slug}
        </div>
      </>
    ),
  },
  {
    key: "starts",
    header: "Starts",
    cell: (e) => e.startsAtText || "Not set",
  },
  { key: "venue", header: "Venue", cell: (e) => e.venue || "Not set" },
  {
    key: "type",
    header: "Type",
    cell: (e) =>
      e.isRequired ? (
        <Badge variant="staff">Required</Badge>
      ) : (
        <Badge>Optional</Badge>
      ),
  },
  { key: "deadline", header: "Deadline", cell: (e) => e.deadlineText },
  {
    key: "invited",
    header: "Invited",
    numeric: true,
    cell: (e) => String(e.invited),
  },
  {
    key: "actions",
    header: "Actions",
    hideHeader: true,
    cell: (e) => (
      <div className="row-end">
        <Link
          className="btn btn-sm"
          href={`/admin/events?tab=edit&id=${encodeURIComponent(e.id)}`}
        >
          Edit
        </Link>
        <Link
          className="btn btn-sm btn-quiet"
          href={`/admin/menus?event=${encodeURIComponent(e.slug)}`}
        >
          Menu
        </Link>
      </div>
    ),
  },
];

/** The All events tab: every event in display order. */
export function EventsListView({ events }: { events: EventRow[] }) {
  return (
    <section className="card">
      <DataTable
        columns={columns}
        rows={events}
        rowKey={(e) => e.id}
        empty="No events yet. Use New event to add the first one."
      />
    </section>
  );
}
