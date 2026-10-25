import Link from "next/link";
import type { OverviewData, OverviewEvent } from "@/lib/admin/data/overview";
import { formatPacific } from "@/lib/admin/time";
import { Badge, Card, EmptyState, PageHeader, StatTile } from "./primitives";
import { DataTable, type Column } from "./DataTable";

const EVENT_COLUMNS: Column<OverviewEvent>[] = [
  {
    key: "event",
    header: "Event",
    cell: (e) => <span className="strong">{e.name}</span>,
  },
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
  { key: "invited", header: "Invited", numeric: true, cell: (e) => e.invited },
  {
    key: "attending",
    header: "Attending",
    numeric: true,
    cell: (e) => e.attending,
  },
  {
    key: "declined",
    header: "Declined",
    numeric: true,
    cell: (e) => e.declined,
  },
  { key: "pending", header: "Pending", numeric: true, cell: (e) => e.pending },
];

function followUps(data: OverviewData) {
  return [
    {
      label: "Required answers outstanding",
      count: data.requiredOutstanding,
      href: "/admin/campaigns",
      action: "Remind",
    },
    {
      label: "Optional answers outstanding",
      count: data.optionalOutstanding,
      href: "/admin/campaigns",
      action: "Remind",
    },
    {
      label: "Meal choices outstanding",
      count: data.mealsOutstanding,
      href: "/admin/households?show=meals",
      action: "View",
    },
    {
      label: "Delivery problems",
      count: data.deliveryProblems,
      href: "/admin/households?show=delivery_problem",
      action: "View",
    },
    {
      label: "Paper only (no email)",
      count: data.paperOnly,
      href: "/admin/households?show=paper_only",
      action: "View",
    },
    {
      label: "Possible duplicates",
      count: data.possibleDuplicates,
      href: "/admin/households?view=duplicates",
      action: "Review",
    },
  ];
}

function statusLine(data: OverviewData): string {
  const status = data.rsvpOpen ? "RSVPs are open." : "RSVPs are closed.";
  if (!data.defaultDeadline) return status;
  return `${status} Default deadline ${formatPacific(data.defaultDeadline, { date: true, time: true })}.`;
}

/** The overview page body. Synchronous: all data arrives as props. */
export function OverviewView({ data }: { data: OverviewData }) {
  return (
    <div className="stack">
      <PageHeader
        title="Overview"
        description={statusLine(data)}
        actions={
          <>
            <Link href="/admin/settings" className="btn">
              RSVP settings
            </Link>
            <Link href="/admin/campaigns" className="btn btn-primary">
              Send a reminder
            </Link>
          </>
        }
      />

      <div className="stats">
        <StatTile value={data.householdCount} label="Households" />
        {data.ceremony ? (
          <StatTile
            value={
              <>
                {data.ceremony.attending}{" "}
                <span className="muted small">of {data.ceremony.invited}</span>
              </>
            }
            label="Attending the ceremony"
          />
        ) : null}
        <StatTile
          value={data.requiredOutstanding}
          label="Households owing a required answer"
        />
        <StatTile
          value={data.deliveryProblems}
          label="Households with a delivery problem"
        />
      </div>

      <section className="card">
        <div className="card-h">
          <h2 className="card-t">Answers by event</h2>
          <Link href="/admin/events" className="btn btn-quiet btn-sm">
            Manage events
          </Link>
        </div>
        <DataTable
          columns={EVENT_COLUMNS}
          rows={data.events}
          rowKey={(e) => e.id}
          empty="No events yet."
        />
      </section>

      <div className="grid2">
        <Card heading="Needs follow-up">
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {followUps(data).map((item) => (
                  <tr key={item.label}>
                    <td>{item.label}</td>
                    <td className="num strong">{item.count}</td>
                    <td className="right">
                      <Link href={item.href} className="btn btn-sm">
                        {item.action}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <section className="card">
          <div className="card-h">
            <h2 className="card-t">Most outstanding</h2>
            <Link href="/admin/households" className="btn btn-quiet btn-sm">
              All households
            </Link>
          </div>
          {data.mostOutstanding.length === 0 ? (
            <EmptyState>Nothing is outstanding.</EmptyState>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Household</th>
                      <th scope="col" className="num">
                        Required
                      </th>
                      <th scope="col" className="num">
                        Optional
                      </th>
                      <th scope="col" className="num">
                        Meals
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mostOutstanding.map((h) => (
                      <tr key={h.householdId}>
                        <td>
                          <Link href={`/admin/households/${h.householdId}`}>
                            {h.name}
                          </Link>
                        </td>
                        <td className="num">{h.required}</td>
                        <td className="num">{h.optional}</td>
                        <td className="num">{h.meals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-f">
                <span className="muted small">
                  Showing {data.mostOutstanding.length} of {data.householdCount}
                  . Most outstanding first.
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
