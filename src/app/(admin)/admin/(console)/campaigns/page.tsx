import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { CampaignsListView } from "@/components/admin/CampaignsListView";
import { ConfirmPanel } from "@/components/admin/ConfirmPanel";
import { DeliveryView } from "@/components/admin/DeliveryView";
import { CampaignEditor } from "@/components/admin/forms/CampaignEditor";
import { SendCampaignForm } from "@/components/admin/forms/SendCampaignForm";
import {
  Alert,
  Card,
  EmptyState,
  PageHeader,
  TabLinks,
} from "@/components/admin/primitives";
import { cancelCampaign } from "@/lib/admin/actions/campaigns";
import {
  loadCampaign,
  loadCampaigns,
  loadDelivery,
  loadEventOptions,
  loadHouseholdOptions,
  loadMessageTypes,
} from "@/lib/admin/data/campaigns";
import { messageFor } from "@/lib/admin/messages";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

type SearchParams = Record<string, string | string[] | undefined>;

const TABS = [
  { value: "list", label: "All campaigns" },
  { value: "edit", label: "Edit campaign" },
  { value: "delivery", label: "Delivery status" },
];

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

async function confirmCancel(formData: FormData) {
  "use server";
  const result = await cancelCampaign(null, formData);
  redirect(
    result.ok
      ? "/admin/campaigns?notice=cancelled"
      : "/admin/campaigns?notice=cancel_failed",
  );
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const { supabase } = session;

  const params = await searchParams;
  const tab = TABS.some((t) => t.value === first(params.tab))
    ? (first(params.tab) as string)
    : "list";
  const idParam = z.guid().safeParse(first(params.id));
  const id = idParam.success ? idParam.data : undefined;
  const confirm = first(params.confirm);
  const notice = first(params.notice);
  const editHref = id
    ? `/admin/campaigns?tab=edit&id=${encodeURIComponent(id)}`
    : "/admin/campaigns?tab=edit";

  const header = (
    <>
      <PageHeader
        title="Campaigns"
        description="Emails to households. All times are Pacific time (PT)."
        actions={
          <Link className="btn btn-primary" href="/admin/campaigns?tab=edit">
            New campaign
          </Link>
        }
      />
      <TabLinks
        label="Campaign views"
        basePath="/admin/campaigns"
        param="tab"
        tabs={TABS}
        current={tab}
        query={{ id }}
      />
    </>
  );

  if (tab === "edit") {
    const [campaign, messageTypes, events, households] = await Promise.all([
      id ? loadCampaign(id, supabase) : Promise.resolve(null),
      loadMessageTypes(supabase),
      loadEventOptions(supabase),
      loadHouseholdOptions(supabase),
    ]);
    if (id && !campaign) {
      return (
        <div className="stack">
          {header}
          <Alert variant="error">{messageFor("not_found")}</Alert>
        </div>
      );
    }
    const editable =
      campaign?.status === "draft" || campaign?.status === "scheduled";
    return (
      <div className="stack">
        {header}
        {confirm === "cancel" && campaign && editable ? (
          <ConfirmPanel
            heading={`Cancel ${campaign.name}?`}
            consequence="The campaign will not be sent, and it can no longer be edited."
            action={confirmCancel}
            confirmLabel="Cancel campaign"
            cancelHref={editHref}
            hiddenFields={{ id: campaign.id }}
          />
        ) : null}
        <Card heading={campaign ? campaign.name : "New campaign"}>
          <CampaignEditor
            campaign={campaign ?? undefined}
            messageTypes={messageTypes}
            events={events}
            households={households}
            notice={first(params.saved) ? "Saved." : undefined}
          />
        </Card>
        {campaign && editable ? (
          <SendCampaignForm
            key={confirm ?? "idle"}
            campaignId={campaign.id}
            backHref={editHref}
            startConfirmed={confirm === "send"}
          />
        ) : null}
      </div>
    );
  }

  if (tab === "delivery") {
    const delivery = id ? await loadDelivery(id, supabase) : null;
    return (
      <div className="stack">
        {header}
        {id && !delivery ? (
          <Alert variant="error">{messageFor("not_found")}</Alert>
        ) : null}
        {delivery ? (
          <Card heading={delivery.campaign.name}>
            <DeliveryView delivery={delivery} />
          </Card>
        ) : null}
        {!id ? (
          <EmptyState>
            Choose a sent campaign from the list to see its delivery status.
          </EmptyState>
        ) : null}
      </div>
    );
  }

  const campaigns = await loadCampaigns(supabase);
  return (
    <div className="stack">
      {header}
      {notice === "cancelled" ? (
        <Alert variant="ok">The campaign was cancelled.</Alert>
      ) : null}
      {notice === "cancel_failed" ? (
        <Alert variant="error">{messageFor("invalid_status_transition")}</Alert>
      ) : null}
      <CampaignsListView campaigns={campaigns} />
    </div>
  );
}
