import Link from "next/link";
import type { PreviewData } from "@/lib/admin/actions/campaigns";
import { DataTable, type Column } from "./DataTable";
import { Badge, Card, EmptyState } from "./primitives";

type PreviewRow = {
  householdId: string;
  name: string;
  /** Absent for a household that will be emailed. */
  reason?: string;
};

const REASON_BADGE: Record<string, string> = {
  no_email: "No email",
  opted_out: "Opted out",
  already_responded: "Already responded",
  household_missing: "Household missing",
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function skippedLine(skipped: PreviewData["skipped"]): string {
  const count = (reason: string) =>
    skipped.filter((s) => s.reason === reason).length;
  const noEmail = count("no_email");
  const optedOut = count("opted_out");
  const other = skipped.length - noEmail - optedOut;
  const parts = [
    noEmail ? `${noEmail} with no email (need a paper invite)` : "",
    optedOut ? `${optedOut} opted out` : "",
    other ? `${other} for another reason` : "",
  ].filter(Boolean);
  const lead = `${skipped.length} ${plural(skipped.length, "is", "are")} skipped`;
  return `${lead}: ${parts.join(", ")}`;
}

const COLUMNS: Column<PreviewRow>[] = [
  {
    key: "household",
    header: "Household",
    cell: (r) => (
      <Link href={`/admin/households/${encodeURIComponent(r.householdId)}`}>
        {r.name}
      </Link>
    ),
  },
  {
    key: "result",
    header: "Result",
    cell: (r) =>
      r.reason === undefined ? (
        <Badge variant="ok">Will send</Badge>
      ) : (
        <Badge variant="warn">{REASON_BADGE[r.reason] ?? "Skipped"}</Badge>
      ),
  },
];

export function AudiencePreviewView({ preview }: { preview: PreviewData }) {
  const { willSend, skipped } = preview;
  if (willSend.length === 0 && skipped.length === 0) {
    return (
      <Card heading="Audience preview">
        <EmptyState>No households match this audience.</EmptyState>
      </Card>
    );
  }
  const rows: PreviewRow[] = [...willSend, ...skipped];
  return (
    <Card heading="Audience preview">
      <div className="stack-sm">
        <p className="strong">
          {willSend.length} {plural(willSend.length, "household", "households")}{" "}
          will be emailed
        </p>
        {skipped.length ? <p>{skippedLine(skipped)}</p> : null}
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.householdId}
          empty="No households."
        />
      </div>
    </Card>
  );
}
