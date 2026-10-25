"use client";

import Link from "next/link";
import { useActionState } from "react";
import { previewAudience, saveCampaign } from "@/lib/admin/actions/campaigns";
import { audienceToForm, type EventName } from "@/lib/admin/audience-form";
import type {
  CampaignDetail,
  HouseholdOption,
  MessageTypeOption,
} from "@/lib/admin/data/campaigns";
import { AudiencePreviewView } from "../AudiencePreviewView";
import { Alert, Field } from "../primitives";

export type CampaignEditorProps = {
  /** Absent for a new campaign. */
  campaign?: CampaignDetail;
  messageTypes: MessageTypeOption[];
  events: EventName[];
  households: HouseholdOption[];
  /** A confirmation from the page, for example after the first save. */
  notice?: string;
};

const READ_ONLY_NOTES: Record<string, string> = {
  sending: "This campaign is being sent, so it can no longer be edited.",
  done: "This campaign has been sent, so it can no longer be edited.",
  cancelled: "This campaign was cancelled, so it can no longer be edited.",
};

const FILTERS: Array<{
  name: string;
  label: string;
  /** The select that names the event, when the filter needs one. */
  eventField?: string;
}> = [
  {
    name: "required_events_unanswered",
    label: "Has unanswered required events",
  },
  {
    name: "optional_event_unanswered",
    label: "Has an unanswered optional event",
    eventField: "optional_event_unanswered",
  },
  {
    name: "invited_to_event",
    label: "Invited to a specific event",
    eventField: "invited_to_event",
  },
  {
    name: "meals_not_chosen",
    label: "Attending guests with meals not chosen",
  },
  {
    name: "not_yet_sent_message_type",
    label: "Has not already received this message type",
  },
  { name: "delivery_problem", label: "Delivery problem only" },
];

export function CampaignEditor({
  campaign,
  messageTypes,
  events,
  households,
  notice,
}: CampaignEditorProps) {
  const [saved, saveAction, saving] = useActionState(saveCampaign, null);
  const [previewed, previewAction, previewing] = useActionState(
    previewAudience,
    null,
  );

  if (
    campaign &&
    campaign.status !== "draft" &&
    campaign.status !== "scheduled"
  ) {
    return (
      <div className="stack-sm">
        <Alert variant="info">{READ_ONLY_NOTES[campaign.status]}</Alert>
        {campaign.status === "done" || campaign.status === "sending" ? (
          <Link
            className="btn"
            href={`/admin/campaigns?tab=delivery&id=${encodeURIComponent(campaign.id)}`}
          >
            View delivery
          </Link>
        ) : null}
      </div>
    );
  }

  // After a refusal, refill from what was typed; otherwise from the campaign.
  const failed = [saved, previewed].find((r) => r && !r.ok);
  const typed = failed && !failed.ok ? failed.values : undefined;
  const initial: Record<string, string | string[]> = typed ?? {
    name: campaign?.name ?? "",
    message_type_key: campaign?.messageTypeKey ?? messageTypes[0]?.key ?? "",
    scheduled_for: campaign?.scheduledLocal ?? "",
    ...(campaign
      ? audienceToForm(campaign.audience)
      : { audience_scope: "all" }),
  };
  const text = (name: string) => {
    const value = initial[name];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  };
  const fieldErrors = failed && !failed.ok ? (failed.fieldErrors ?? {}) : {};
  const refusal = failed && !failed.ok ? failed.message : null;
  const savedOk = saved?.ok ? saved.data?.message : undefined;

  return (
    <form action={saveAction} className="stack-sm">
      {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
      {refusal ? <Alert variant="error">{refusal}</Alert> : null}
      {savedOk || notice ? (
        <Alert variant="ok">{savedOk ?? notice}</Alert>
      ) : null}

      <Field id="name" label="Campaign name" error={fieldErrors.name}>
        <input id="name" name="name" type="text" defaultValue={text("name")} />
      </Field>

      <Field
        id="message_type_key"
        label="Message type"
        hint="Households that turned off reminders are skipped for non-essential types."
        error={fieldErrors.message_type_key}
      >
        <select
          id="message_type_key"
          name="message_type_key"
          defaultValue={text("message_type_key")}
        >
          {messageTypes.map((type) => (
            <option key={type.key} value={type.key}>
              {type.isEssential ? type.label : `${type.label} (non-essential)`}
            </option>
          ))}
        </select>
      </Field>

      <Field id="audience_scope" label="Who receives it">
        <select
          id="audience_scope"
          name="audience_scope"
          defaultValue={text("audience_scope")}
        >
          <option value="all">Everyone</option>
          <option value="household">One household</option>
          <option value="filter">Households matching filters</option>
        </select>
      </Field>

      <Field
        id="household_id"
        label="Household"
        hint="Used when you choose One household."
        error={fieldErrors.household_id}
      >
        <select
          id="household_id"
          name="household_id"
          defaultValue={text("household_id")}
        >
          <option value="">Choose a household</option>
          {households.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="group">
        <legend>Filters (all must match)</legend>
        {FILTERS.map((filter) => (
          <div key={filter.name} className="stack-sm">
            <label className="check">
              <input
                type="checkbox"
                name={`filter_${filter.name}`}
                defaultChecked={Boolean(initial[`filter_${filter.name}`])}
              />
              {filter.label}
            </label>
            {filter.eventField ? (
              <select
                name={filter.eventField}
                aria-label={`Event for: ${filter.label}`}
                defaultValue={text(filter.eventField)}
              >
                <option value="">Choose an event</option>
                {events.map((e) => (
                  <option key={e.slug} value={e.slug}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ))}
        <p className="hint">
          Used when you choose Households matching filters.
        </p>
      </fieldset>

      <Field
        id="scheduled_for"
        label="Send at (Pacific time)"
        hint="Leave empty to keep as a draft or send now."
        error={fieldErrors.scheduled_for}
      >
        <input
          id="scheduled_for"
          name="scheduled_for"
          type="datetime-local"
          defaultValue={text("scheduled_for")}
        />
      </Field>

      <div className="row">
        <button
          type="submit"
          className="btn"
          formAction={previewAction}
          disabled={previewing || saving}
        >
          Preview audience
        </button>
        {campaign?.status === "scheduled" ? null : (
          <button
            type="submit"
            name="intent"
            value="draft"
            className="btn"
            disabled={saving}
          >
            Save draft
          </button>
        )}
        <button
          type="submit"
          name="intent"
          value="schedule"
          className="btn btn-primary"
          disabled={saving}
        >
          Schedule
        </button>
        {campaign ? (
          <Link
            className="btn btn-danger"
            href={`/admin/campaigns?tab=edit&id=${encodeURIComponent(campaign.id)}&confirm=cancel`}
          >
            Cancel campaign
          </Link>
        ) : null}
      </div>

      {previewed?.ok && previewed.data ? (
        <AudiencePreviewView preview={previewed.data} />
      ) : null}
    </form>
  );
}
