import Link from "next/link";
import type {
  CampaignListRow,
  CampaignStatus,
} from "@/lib/admin/data/campaigns";
import { DataTable, type Column } from "./DataTable";
import { Badge, type BadgeVariant } from "./primitives";

const STATUS: Record<CampaignStatus, { label: string; variant: BadgeVariant }> =
  {
    draft: { label: "Draft", variant: "default" },
    scheduled: { label: "Scheduled", variant: "staff" },
    sending: { label: "Sending", variant: "warn" },
    done: { label: "Done", variant: "ok" },
    cancelled: { label: "Cancelled", variant: "default" },
  };

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const { label, variant } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const base = (id: string, tab: string) =>
  `/admin/campaigns?tab=${tab}&id=${encodeURIComponent(id)}`;
const editHref = (id: string) => base(id, "edit");
const cancelHref = (id: string) => `${base(id, "edit")}&confirm=cancel`;
const deliveryHref = (id: string) => base(id, "delivery");

const COLUMNS: Column<CampaignListRow>[] = [
  {
    key: "campaign",
    header: "Campaign",
    cell: (c) => (
      <>
        <span className="strong">{c.name}</span>
        <span className="table-sub">{c.messageTypeLabel}</span>
        {c.lastError ? <span className="table-sub">{c.lastError}</span> : null}
      </>
    ),
  },
  { key: "audience", header: "Audience", cell: (c) => c.audience },
  {
    key: "status",
    header: "Status",
    cell: (c) => <CampaignStatusBadge status={c.status} />,
  },
  {
    key: "sends",
    header: "Sends",
    cell: (c) => c.scheduledFor ?? "Not scheduled",
  },
  {
    key: "actions",
    header: "Actions",
    hideHeader: true,
    cell: (c) => (
      <div className="row">
        {c.status === "draft" || c.status === "scheduled" ? (
          <Link className="btn btn-sm" href={editHref(c.id)}>
            Edit
          </Link>
        ) : null}
        {c.status === "scheduled" ? (
          <Link className="btn btn-sm" href={cancelHref(c.id)}>
            Cancel
          </Link>
        ) : null}
        {c.status === "sending" || c.status === "done" ? (
          <Link className="btn btn-sm" href={deliveryHref(c.id)}>
            View delivery
          </Link>
        ) : null}
      </div>
    ),
  },
];

export function CampaignsListView({
  campaigns,
}: {
  campaigns: CampaignListRow[];
}) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={campaigns}
      rowKey={(c) => c.id}
      empty="There are no campaigns yet. Choose New campaign to write the first one."
    />
  );
}
