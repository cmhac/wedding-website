import type {
  DietaryRow,
  DishTotalRow,
  MealConflictRow,
} from "@/lib/admin/data/reports";
import { AnsweredByBadge } from "./AnsweredBy";
import { DataTable } from "./DataTable";
import { Alert, Badge, Card, Field, PageHeader, TabLinks } from "./primitives";

export type ReportTab = "dish" | "diet" | "conflicts" | "exports";

const EXPORTS = [
  {
    kind: "guests",
    title: "Guest list",
    about: "Every household and guest, with the events each is invited to.",
  },
  {
    kind: "responses",
    title: "Responses",
    about: "Every answer, meal choice and dietary note, by guest and event.",
  },
  {
    kind: "caterer",
    title: "Caterer",
    about: "Dish totals and the dietary list, for the caterer.",
  },
] as const;

function SeverityBadge({ severity }: { severity: DietaryRow["severity"] }) {
  if (severity === "allergy") return <Badge variant="bad">Allergy</Badge>;
  if (severity === "preference") return <Badge>Preference</Badge>;
  return null;
}

const SEVERITY_ORDER = { allergy: 0, preference: 1 } as const;
const severityRank = (s: DietaryRow["severity"]) =>
  s === null ? 2 : SEVERITY_ORDER[s];

export function ReportsView({
  tab,
  eventSlug,
  events,
  dish,
  diet,
  conflicts,
}: {
  tab: ReportTab;
  eventSlug: string;
  events: { slug: string; name: string }[];
  dish: DishTotalRow[];
  diet: DietaryRow[];
  conflicts: MealConflictRow[];
}) {
  const dietSorted = [...diet].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );
  return (
    <div className="stack">
      <PageHeader
        title="Reports"
        description="Meals, dietary needs and downloads."
      />
      <form method="get" action="/admin/reports" className="row">
        <input type="hidden" name="tab" value={tab} />
        <Field id="report-event" label="Event">
          <select id="report-event" name="event" defaultValue={eventSlug}>
            {events.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn">
          Show
        </button>
      </form>
      <TabLinks
        label="Reports"
        basePath="/admin/reports"
        param="tab"
        current={tab}
        query={{ event: eventSlug }}
        tabs={[
          { value: "dish", label: "Dish totals" },
          { value: "diet", label: "Dietary list" },
          {
            value: "conflicts",
            label: `Meal conflicts (${conflicts.length})`,
          },
          { value: "exports", label: "Exports" },
        ]}
      />
      {tab === "dish" ? (
        <Card heading="Dish totals">
          <p className="hint">Attending guests only</p>
          <DataTable
            rows={dish}
            rowKey={(r) => `${r.courseId}:${r.dishName}`}
            empty="No dishes or courses for this event yet."
            columns={[
              { key: "course", header: "Course", cell: (r) => r.courseName },
              { key: "dish", header: "Dish", cell: (r) => r.dishName },
              {
                key: "count",
                header: "Chosen",
                numeric: true,
                cell: (r) => String(r.chosenCount),
              },
            ]}
          />
        </Card>
      ) : null}
      {tab === "diet" ? (
        <Card heading="Dietary list">
          <p className="hint">Attending guests with restrictions</p>
          <DataTable
            rows={dietSorted}
            rowKey={(r) => `${r.guestId}:${r.restriction ?? "note"}`}
            empty="No attending guest has a dietary restriction or note."
            columns={[
              { key: "guest", header: "Guest", cell: (r) => r.guestName },
              {
                key: "household",
                header: "Household",
                cell: (r) => r.householdName,
              },
              {
                key: "restriction",
                header: "Restriction",
                cell: (r) => r.restriction ?? "",
              },
              {
                key: "severity",
                header: "Severity",
                cell: (r) => <SeverityBadge severity={r.severity} />,
              },
              { key: "notes", header: "Notes", cell: (r) => r.notes ?? "" },
            ]}
          />
        </Card>
      ) : null}
      {tab === "conflicts" ? (
        <Card heading="Meal conflicts">
          <p className="hint">Chosen dishes that clash with a restriction</p>
          <p className="hint">
            To resolve: ask the household, or change the choice for them. A
            change you make is recorded as staff.
          </p>
          <DataTable
            rows={conflicts}
            rowKey={(r) => r.key}
            empty="There are no meal conflicts for this event."
            columns={[
              { key: "guest", header: "Guest", cell: (r) => r.guestName },
              {
                key: "household",
                header: "Household",
                cell: (r) => r.householdName,
              },
              { key: "dish", header: "Chosen dish", cell: (r) => r.dishName },
              {
                key: "clash",
                header: "Conflicts with",
                cell: (r) => (
                  <>
                    <SeverityBadge severity={r.severity} /> {r.conflictsWith}
                  </>
                ),
              },
              {
                key: "by",
                header: "Choice made by",
                cell: (r) => <AnsweredByBadge answeredBy={r.answeredBy} />,
              },
            ]}
          />
        </Card>
      ) : null}
      {tab === "exports" ? (
        <Card heading="CSV exports">
          <Alert variant="warn">
            Exports contain personal data. Keep downloaded files private.
          </Alert>
          <ul className="stack-sm">
            {EXPORTS.map((x) => (
              <li key={x.kind}>
                <a
                  className="btn"
                  href={`/api/admin/exports/${x.kind}`}
                  download
                >
                  Download {x.title}
                </a>{" "}
                <span className="hint">{x.about}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
