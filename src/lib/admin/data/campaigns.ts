import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audienceSchema, type Audience } from "@/lib/campaigns/audience";
import { createServerSupabase } from "@/lib/supabase/server";
import { describeAudience, type EventName } from "../audience-form";
import { messageFor } from "../messages";
import { formatPhoneForStaff } from "@/lib/sms/phone-format";
import { plainErrorReason } from "@/lib/sms/status";
import { formatPacific, isoToPacificLocal } from "../time";

export type CampaignStatus =
  "draft" | "scheduled" | "sending" | "done" | "cancelled";

export type CampaignListRow = {
  id: string;
  name: string;
  messageTypeKey: string;
  messageTypeLabel: string;
  /** The audience in words, for example "Invited to Rehearsal". */
  audience: string;
  status: CampaignStatus;
  /** The send time in Pacific time, or null when there is none. */
  scheduledFor: string | null;
  /** Why the last attempt failed, in plain words, or null. */
  lastError: string | null;
  /** A rehearsal send to one household, not the real send. */
  isTest?: boolean;
};

export type CampaignDetail = {
  id: string;
  name: string;
  messageTypeKey: string;
  audience: Audience;
  status: CampaignStatus;
  /** A Pacific `datetime-local` value, or "" when not scheduled. */
  scheduledLocal: string;
  /** How it is sent; email when the column is absent. */
  channel?: "email" | "text" | "both";
};

export type DeliveryRow = {
  id: string;
  householdId: string | null;
  householdName: string;
  /** The address this message was sent to (one row per address), or null when skipped. */
  address: string | null;
  /** "text" for a text message to a phone number; absent (email) otherwise. */
  channel?: "text";
  status: string;
  /** Plain-English detail, or "" when there is nothing to add. */
  detail: string;
  /** The last update, in Pacific time. */
  at: string;
};

export type DeliveryData = {
  campaign: {
    id: string;
    name: string;
    status: CampaignStatus;
    /** A rehearsal send to one household, not the real send. */
    isTest?: boolean;
  };
  rows: DeliveryRow[];
  counts: Record<string, number>;
};

export type MessageTypeOption = {
  key: string;
  label: string;
  isEssential: boolean;
};

export type HouseholdOption = { id: string; name: string };

type Row = Record<string, unknown>;

async function clientOr(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? ((await createServerSupabase()) as SupabaseClient);
}

async function rowsOf(
  name: string,
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error || !Array.isArray(data)) throw new Error(`${name}_unreadable`);
  return data as Row[];
}

const LAST_ERRORS: Record<string, string> = {
  template_missing:
    "No email template is registered for this message type yet.",
  invalid_audience: "The audience for this campaign is not valid.",
};

/** The last error code in plain words; unknown codes get a generic line. */
function lastErrorWords(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null;
  return LAST_ERRORS[code] ?? messageFor(code);
}

function textDetail(row: Row): string {
  const status = row.status as string;
  if (status === "skipped") {
    switch (row.skip_reason) {
      case "not_opted_in":
        return "Not opted in to texts";
      case "declined":
        return "Declined texts";
      case "no_phone":
        return "No phone number on file";
      case "texting_unavailable":
        return "Texting was switched off";
      case "invalid_number":
        return "Not a valid United States number";
      case "opted_out":
        return "Opted out of reminders";
      default:
        return "Skipped";
    }
  }
  if (status === "failed")
    return plainErrorReason(row.error_code as string | null);
  if (status === "bounced" || status === "complained") {
    return "Household flagged with a delivery problem";
  }
  return "";
}

function messageDetail(row: Row): string {
  if (row.channel === "text") return textDetail(row);
  const status = row.status as string;
  if (status === "skipped") {
    switch (row.skip_reason) {
      case "no_email":
        return "No email on file";
      case "opted_out":
        return "Opted out of reminders";
      case "already_responded":
        return "Already responded";
      case "household_missing":
        return "Household no longer exists";
      default:
        return "Skipped";
    }
  }
  if (status === "bounced" || status === "complained") {
    return "Household flagged with a delivery problem";
  }
  if (status === "failed") return "The email could not be sent";
  return "";
}

export async function loadMessageTypes(
  supabase?: SupabaseClient,
): Promise<MessageTypeOption[]> {
  const client = await clientOr(supabase);
  const rows = await rowsOf(
    "message_types",
    client
      .from("message_types")
      .select("key, label, is_essential")
      .order("label", { ascending: true }),
  );
  return rows.map((r) => ({
    key: r.key as string,
    label: r.label as string,
    isEssential: Boolean(r.is_essential),
  }));
}

export async function loadEventOptions(
  supabase?: SupabaseClient,
): Promise<EventName[]> {
  const client = await clientOr(supabase);
  const rows = await rowsOf(
    "events",
    client
      .from("events")
      .select("slug, name")
      .order("display_order", { ascending: true }),
  );
  return rows.map((r) => ({ slug: r.slug as string, name: r.name as string }));
}

/** Every household, by name, for the "one household" choice. */
export async function loadHouseholdOptions(
  supabase?: SupabaseClient,
): Promise<HouseholdOption[]> {
  const client = await clientOr(supabase);
  const rows = await rowsOf("households", client.rpc("staff_households"));
  return rows
    .map((r) => ({ id: r.id as string, name: r.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCampaigns(
  supabase?: SupabaseClient,
): Promise<CampaignListRow[]> {
  const client = await clientOr(supabase);
  const [rows, types, events] = await Promise.all([
    rowsOf(
      "campaigns",
      client
        .from("campaigns")
        .select(
          "id, name, message_type_key, audience, status, scheduled_for, last_error_code, created_at, is_test",
        )
        .order("created_at", { ascending: false }),
    ),
    loadMessageTypes(client),
    loadEventOptions(client),
  ]);
  const labels = new Map(types.map((t) => [t.key, t.label]));
  return rows.map((r) => {
    const audience = audienceSchema.safeParse(r.audience);
    const key = r.message_type_key as string;
    return {
      id: r.id as string,
      name: r.name as string,
      messageTypeKey: key,
      messageTypeLabel: labels.get(key) ?? key,
      audience: audience.success
        ? describeAudience(audience.data, events)
        : "Audience not recognised",
      status: r.status as CampaignStatus,
      scheduledFor: r.scheduled_for
        ? formatPacific(r.scheduled_for as string)
        : null,
      lastError: lastErrorWords(r.last_error_code),
      ...(r.is_test === true ? { isTest: true } : {}),
    };
  });
}

/** The editable fields of one campaign, or null when it does not exist. */
export async function loadCampaign(
  id: string,
  supabase?: SupabaseClient,
): Promise<CampaignDetail | null> {
  const client = await clientOr(supabase);
  const rows = await rowsOf(
    "campaigns",
    client
      .from("campaigns")
      .select(
        "id, name, message_type_key, audience, status, scheduled_for, channel",
      )
      .eq("id", id),
  );
  const r = rows[0];
  if (!r) return null;
  const audience = audienceSchema.safeParse(r.audience);
  return {
    id: r.id as string,
    name: r.name as string,
    messageTypeKey: r.message_type_key as string,
    audience: audience.success ? audience.data : { scope: "all" },
    status: r.status as CampaignStatus,
    scheduledLocal: isoToPacificLocal(r.scheduled_for as string | null),
    ...(r.channel === "text" || r.channel === "both"
      ? { channel: r.channel }
      : {}),
  };
}

/** One row per message for a campaign, with counts per status. */
export async function loadDelivery(
  id: string,
  supabase?: SupabaseClient,
  options: { includeTexts?: boolean } = {},
): Promise<DeliveryData | null> {
  const client = await clientOr(supabase);
  const campaigns = await rowsOf(
    "campaigns",
    client.from("campaigns").select("id, name, status, is_test").eq("id", id),
  );
  const campaign = campaigns[0];
  if (!campaign) return null;

  const [allMessages, households] = await Promise.all([
    rowsOf(
      "messages",
      client
        .from("messages")
        .select(
          "id, household_id, to_email, channel, to_phone, status, skip_reason, error_code, queued_at, sent_at, last_event_at",
        )
        .eq("campaign_id", id)
        .order("queued_at", { ascending: true }),
    ),
    loadHouseholdOptions(client),
  ]);
  const names = new Map(households.map((h) => [h.id, h.name]));
  // Texts are shown only while texting is configured; otherwise they stay hidden.
  const messages = options.includeTexts
    ? allMessages
    : allMessages.filter((m) => m.channel !== "text");

  const counts: Record<string, number> = {};
  const rows = messages.map((m): DeliveryRow => {
    const status = m.status as string;
    counts[status] = (counts[status] ?? 0) + 1;
    const householdId = (m.household_id as string | null) ?? null;
    const moment = (m.last_event_at ?? m.sent_at ?? m.queued_at) as string;
    return {
      id: m.id as string,
      householdId,
      householdName: householdId
        ? (names.get(householdId) ?? "Unknown household")
        : "Deleted household",
      address:
        m.channel === "text"
          ? m.to_phone
            ? formatPhoneForStaff(String(m.to_phone))
            : null
          : ((m.to_email as string | null) ?? null),
      ...(m.channel === "text" ? { channel: "text" as const } : {}),
      status,
      detail: messageDetail(m),
      at: formatPacific(moment),
    };
  });
  rows.sort(
    (a, b) =>
      a.householdName.localeCompare(b.householdName) ||
      (a.address ?? "").localeCompare(b.address ?? ""),
  );

  return {
    campaign: {
      id: campaign.id as string,
      name: campaign.name as string,
      status: campaign.status as CampaignStatus,
      ...(campaign.is_test === true ? { isTest: true } : {}),
    },
    rows,
    counts,
  };
}
