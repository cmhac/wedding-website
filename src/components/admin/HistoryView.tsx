import Link from "next/link";
import type {
  ChangeLogRow,
  HistoryPage,
  MealHistoryRow,
  RsvpHistoryRow,
} from "@/lib/admin/data/history";
import { formatPacific } from "@/lib/admin/time";
import { AnsweredByBadge } from "./AnsweredBy";
import { DataTable } from "./DataTable";
import { Card, Field, PageHeader, TabLinks } from "./primitives";

export type HistoryTab = "log" | "rsvp" | "meals";

export type HistoryFilterValues = { from: string; to: string; by: string };

const BASE_PATH = "/admin/history";

function Pager({
  tab,
  filters,
  page,
  hasMore,
}: {
  tab: HistoryTab;
  filters: HistoryFilterValues;
  page: number;
  hasMore: boolean;
}) {
  const href = (target: number) => {
    const search = new URLSearchParams({ tab });
    if (filters.from) search.set("from", filters.from);
    if (filters.to) search.set("to", filters.to);
    if (filters.by && filters.by !== "anyone") search.set("by", filters.by);
    search.set("page", String(target));
    return `${BASE_PATH}?${search.toString()}`;
  };
  if (page <= 1 && !hasMore) return null;
  return (
    <div className="row">
      {page > 1 ? (
        <Link className="btn btn-quiet btn-sm" href={href(page - 1)}>
          Previous page
        </Link>
      ) : null}
      <span className="hint">Page {page}</span>
      {hasMore ? (
        <Link className="btn btn-quiet btn-sm" href={href(page + 1)}>
          Next page
        </Link>
      ) : null}
    </div>
  );
}

export function HistoryView({
  tab,
  filters,
  staffOptions,
  log,
  rsvp,
  meals,
}: {
  tab: HistoryTab;
  filters: HistoryFilterValues;
  staffOptions: { id: string; label: string }[];
  log?: HistoryPage<ChangeLogRow>;
  rsvp?: HistoryPage<RsvpHistoryRow>;
  meals?: HistoryPage<MealHistoryRow>;
}) {
  const current = tab === "log" ? log : tab === "rsvp" ? rsvp : meals;
  return (
    <div className="stack">
      <PageHeader
        title="History"
        description="Read only. Times are Pacific (PT). Names are never stored in history."
      />
      <TabLinks
        label="History"
        basePath={BASE_PATH}
        param="tab"
        current={tab}
        query={{ from: filters.from, to: filters.to, by: filters.by }}
        tabs={[
          { value: "log", label: "Change log" },
          { value: "rsvp", label: "RSVP history" },
          { value: "meals", label: "Meal choices" },
        ]}
      />
      <form method="get" action={BASE_PATH} className="row">
        <input type="hidden" name="tab" value={tab} />
        <Field id="history-from" label="From">
          <input
            id="history-from"
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </Field>
        <Field id="history-to" label="To">
          <input
            id="history-to"
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </Field>
        <Field id="history-by" label="Changed by">
          <select id="history-by" name="by" defaultValue={filters.by}>
            <option value="anyone">Anyone</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option value="guest">Guest</option>
            <option value="system">System</option>
          </select>
        </Field>
        <button type="submit" className="btn btn-primary">
          Apply
        </button>
      </form>

      {tab === "log" && log ? (
        <Card heading="Change log">
          <p className="hint">Shows which fields changed, never their values</p>
          <DataTable
            rows={log.rows}
            rowKey={(r) => String(r.id)}
            empty="No changes match these filters."
            columns={[
              {
                key: "when",
                header: "When",
                cell: (r) => formatPacific(r.at, { date: true, time: true }),
              },
              { key: "who", header: "Who", cell: (r) => r.who },
              { key: "what", header: "What", cell: (r) => r.entity },
              { key: "action", header: "Action", cell: (r) => r.action },
              {
                key: "fields",
                header: "Fields changed",
                cell: (r) => r.fieldsChanged,
              },
            ]}
          />
        </Card>
      ) : null}

      {tab === "rsvp" && rsvp ? (
        <Card heading="RSVP history">
          <DataTable
            rows={rsvp.rows}
            rowKey={(r) => String(r.id)}
            empty="No RSVP changes match these filters."
            columns={[
              {
                key: "when",
                header: "When",
                cell: (r) => formatPacific(r.at, { date: true, time: true }),
              },
              { key: "guest", header: "Guest", cell: (r) => r.guestName },
              { key: "event", header: "Event", cell: (r) => r.eventName },
              { key: "change", header: "Change", cell: (r) => r.change },
              {
                key: "by",
                header: "Changed by",
                cell: (r) => <AnsweredByBadge answeredBy={r.answeredBy} />,
              },
            ]}
          />
          <p className="hint">
            Guests deleted from the list show as &quot;Removed guest&quot;.
          </p>
        </Card>
      ) : null}

      {tab === "meals" && meals ? (
        <Card heading="Meal choice history">
          <DataTable
            rows={meals.rows}
            rowKey={(r) => String(r.id)}
            empty="No meal changes match these filters."
            columns={[
              {
                key: "when",
                header: "When",
                cell: (r) => formatPacific(r.at, { date: true, time: true }),
              },
              { key: "guest", header: "Guest", cell: (r) => r.guestName },
              { key: "course", header: "Course", cell: (r) => r.courseName },
              { key: "from", header: "From", cell: (r) => r.from },
              { key: "to", header: "To", cell: (r) => r.to },
              { key: "reason", header: "Reason", cell: (r) => r.reason },
              {
                key: "by",
                header: "Changed by",
                cell: (r) => <AnsweredByBadge answeredBy={r.answeredBy} />,
              },
            ]}
          />
        </Card>
      ) : null}

      {current ? (
        <Pager
          tab={tab}
          filters={filters}
          page={current.page}
          hasMore={current.hasMore}
        />
      ) : null}
    </div>
  );
}
