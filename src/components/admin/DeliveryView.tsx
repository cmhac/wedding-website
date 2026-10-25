import Link from "next/link";
import type { DeliveryData, DeliveryRow } from "@/lib/admin/data/campaigns";
import { DataTable, type Column } from "./DataTable";
import { Badge, type BadgeVariant, EmptyState, StatTile } from "./primitives";

const STATUSES: Array<{ key: string; label: string; variant: BadgeVariant }> = [
  { key: "queued", label: "Queued", variant: "default" },
  { key: "sending", label: "Sending", variant: "default" },
  { key: "sent", label: "Sent", variant: "default" },
  { key: "delivered", label: "Delivered", variant: "ok" },
  { key: "skipped", label: "Skipped", variant: "warn" },
  { key: "bounced", label: "Bounced", variant: "bad" },
  { key: "complained", label: "Complained", variant: "bad" },
  { key: "failed", label: "Failed", variant: "bad" },
];

const COLUMNS: Column<DeliveryRow>[] = [
  {
    key: "household",
    header: "Household",
    cell: (r) =>
      r.householdId ? (
        <Link href={`/admin/households/${encodeURIComponent(r.householdId)}`}>
          {r.householdName}
        </Link>
      ) : (
        r.householdName
      ),
  },
  {
    key: "status",
    header: "Status",
    cell: (r) => {
      const known = STATUSES.find((s) => s.key === r.status);
      return (
        <Badge variant={known?.variant ?? "default"}>
          {known?.label ?? r.status}
        </Badge>
      );
    },
  },
  { key: "detail", header: "Detail", cell: (r) => r.detail },
  { key: "at", header: "Updated", cell: (r) => r.at },
];

export function DeliveryView({ delivery }: { delivery: DeliveryData }) {
  if (delivery.rows.length === 0) {
    return <EmptyState>No messages yet for this campaign.</EmptyState>;
  }
  return (
    <div className="stack">
      <div className="stats">
        {STATUSES.filter((s) => delivery.counts[s.key]).map((s) => (
          <StatTile
            key={s.key}
            value={delivery.counts[s.key]}
            label={s.label}
          />
        ))}
      </div>
      <DataTable
        columns={COLUMNS}
        rows={delivery.rows}
        rowKey={(r) => r.id}
        empty="No messages yet for this campaign."
      />
    </div>
  );
}
