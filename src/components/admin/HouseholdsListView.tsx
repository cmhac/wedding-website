import Link from "next/link";
import type {
  HouseholdList,
  HouseholdQuery,
  HouseholdRow,
} from "@/lib/admin/data/households";
import { DataTable } from "./DataTable";
import { HouseholdsChrome } from "./HouseholdsChrome";
import { Badge } from "./primitives";

const SHOW_OPTIONS: { value: HouseholdQuery["show"]; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "required", label: "Required answers outstanding" },
  { value: "optional", label: "Optional answers outstanding" },
  { value: "meals", label: "Meals outstanding" },
  { value: "delivery_problem", label: "Delivery problem" },
  { value: "paper_only", label: "Paper only (no email)" },
];

function pageHref(query: HouseholdQuery, page: number): string {
  const search = new URLSearchParams();
  if (query.q) search.set("q", query.q);
  if (query.invited) search.set("invited", query.invited);
  if (query.show !== "everyone") search.set("show", query.show);
  search.set("page", String(page));
  return `/admin/households?${search.toString()}`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function Outstanding({ row }: { row: HouseholdRow }) {
  const { required, optional, meals } = row.outstanding;
  const parts = [
    required > 0 ? `${required} required` : null,
    optional > 0 ? `${optional} optional` : null,
    meals > 0 ? `${meals} ${meals === 1 ? "meal" : "meals"}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return <span className="muted">All answered</span>;
  return (
    <>
      {parts[0]}
      {parts.length > 1 ? (
        <div className="table-sub">{parts.slice(1).join(", ")}</div>
      ) : null}
    </>
  );
}

export function HouseholdsListView({
  list,
  query,
  events,
  duplicateCount,
}: {
  list: HouseholdList;
  query: HouseholdQuery;
  events: { slug: string; name: string }[];
  duplicateCount: number;
}) {
  return (
    <>
      <HouseholdsChrome
        description={`${plural(list.totalAll, "household", "households")}, ${plural(list.totalGuests, "guest", "guests")}`}
        duplicateCount={duplicateCount}
        current="all"
      />
      <section className="card">
        <div className="card-b">
          <form method="get" action="/admin/households" className="row-end">
            <div className="field field-grow">
              <label htmlFor="household-search">Search</label>
              <input
                id="household-search"
                type="search"
                name="q"
                placeholder="Household or guest name"
                defaultValue={query.q}
              />
            </div>
            <div className="field field-filter">
              <label htmlFor="household-invited">Invited to</label>
              <select
                id="household-invited"
                name="invited"
                defaultValue={query.invited}
              >
                <option value="">Any event</option>
                {events.map((event) => (
                  <option key={event.slug} value={event.slug}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-filter">
              <label htmlFor="household-show">Show</label>
              <select id="household-show" name="show" defaultValue={query.show}>
                {SHOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn">
              Apply
            </button>
          </form>
        </div>
        <DataTable
          columns={[
            {
              key: "household",
              header: "Household",
              cell: (row) => (
                <>
                  <Link
                    href={`/admin/households/${row.id}`}
                    className="link-strong"
                  >
                    {row.displayName}
                  </Link>
                  {row.plusOnesAllowed > 0 ? (
                    <div className="table-sub">
                      {row.plusOnesAllowed === 1
                        ? "1 plus-one allowed"
                        : `${row.plusOnesAllowed} plus-ones allowed`}
                    </div>
                  ) : null}
                </>
              ),
            },
            {
              key: "guests",
              header: "Guests",
              cell: (row) => (
                <ul className="plain-list">
                  {row.guestNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                  {Array.from({ length: row.unnamedSeats }, (_, i) => (
                    <li key={`unnamed-${i}`} className="muted">
                      Unnamed plus-one
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              key: "email",
              header: "Contact email",
              cell: (row) =>
                row.contactEmail ?? <span className="muted">None</span>,
            },
            {
              key: "outstanding",
              header: "Outstanding",
              cell: (row) => <Outstanding row={row} />,
            },
            {
              key: "status",
              header: "Status",
              cell: (row) => (
                <div className="row">
                  {row.deliveryProblem ? (
                    <Badge variant="bad">Delivery problem</Badge>
                  ) : null}
                  {row.paperOnly ? (
                    <Badge variant="warn">Paper only</Badge>
                  ) : null}
                  {row.possibleDuplicate ? (
                    <Badge>Possible duplicate</Badge>
                  ) : null}
                </div>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              hideHeader: true,
              cell: (row) => (
                <Link
                  href={`/admin/households/${row.id}`}
                  className="btn btn-sm"
                >
                  Open
                  <span className="sr-only"> {row.displayName}</span>
                </Link>
              ),
            },
          ]}
          rows={list.rows}
          rowKey={(row) => row.id}
          empty="No households match."
        />
        <div className="card-f card-f-between">
          <span className="muted small">
            {list.total} of {list.totalAll} households match
          </span>
          <nav className="row" aria-label="Pages">
            {list.page > 1 ? (
              <Link
                href={pageHref(query, list.page - 1)}
                className="btn btn-sm"
              >
                Previous
              </Link>
            ) : null}
            <span className="muted small">
              Page {list.page} of {list.pageCount}
            </span>
            {list.page < list.pageCount ? (
              <Link
                href={pageHref(query, list.page + 1)}
                className="btn btn-sm"
              >
                Next
              </Link>
            ) : null}
          </nav>
        </div>
      </section>
    </>
  );
}
