import { sendEmail, type EmailClient } from "@/lib/email/send";
import {
  getTemplate,
  renderTemplate,
  TemplateError,
  type TemplateRegistry,
} from "@/lib/email/templates";
import { log } from "@/lib/log";
import { audienceSchema } from "./audience";
import { loadCampaignProps, type LooseDb } from "./props";

/**
 * Sends a campaign (contracts/http-endpoints.md). Every step is safe to
 * repeat: messages are queued through the unique (campaign, household)
 * constraint, claimed with `claim_campaign_messages` so concurrent runs never
 * double-send, and sent with the message id as the idempotency key.
 *
 * Only ids, counts and outcome codes are logged: never addresses or names.
 * Expects a service-role client.
 */

export type DispatchErrorCode =
  | "campaign_not_found"
  | "campaign_not_sendable"
  | "template_missing"
  | "invalid_audience"
  | "server_error";

export class DispatchError extends Error {
  constructor(public readonly code: DispatchErrorCode) {
    super(code);
    this.name = "DispatchError";
  }
}

export type DispatchResult = {
  campaign_id: string;
  queued: number;
  sent: number;
  skipped: { no_email: number; opted_out: number; other: number };
  failed: number;
};

export type DispatchOptions = {
  templates?: TemplateRegistry;
  emailClient?: EmailClient;
  batchSize?: number;
  siteUrl?: string;
  rsvpPath?: string;
  now?: () => Date;
};

type Row = Record<string, unknown>;
type AudienceRow = {
  household_id: string;
  deliverable: boolean;
  skip_reason: string | null;
};
type ClaimedMessage = {
  id: string;
  household_id: string | null;
  to_email: string | null;
};

const DEFAULT_BATCH = 50;
// `sending` is included so a campaign interrupted by a crash can be resumed:
// claiming and idempotency keys make a second pass safe.
const SENDABLE = ["draft", "scheduled", "sending"];
const SENT_STATUSES = ["sent", "delivered", "bounced", "complained"];

function fail(): never {
  throw new DispatchError("server_error");
}

export async function sendCampaign(
  db: LooseDb,
  campaignId: string,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const now = options.now ?? (() => new Date());
  const batchSize = options.batchSize ?? DEFAULT_BATCH;

  const { data: campaign, error: campaignError } = await db
    .from("campaigns")
    .select("id, status, message_type_key, audience")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) fail();
  if (!campaign) throw new DispatchError("campaign_not_found");
  if (!SENDABLE.includes(campaign.status)) {
    throw new DispatchError("campaign_not_sendable");
  }

  const audience = audienceSchema.safeParse(campaign.audience);
  if (!audience.success) throw new DispatchError("invalid_audience");

  const { data: type, error: typeError } = await db
    .from("message_types")
    .select("template_key, is_essential")
    .eq("key", campaign.message_type_key)
    .maybeSingle();
  if (typeError || !type) fail();

  // Check the template exists before any message row is created.
  try {
    getTemplate(type.template_key, options.templates);
  } catch (e) {
    if (e instanceof TemplateError) throw new DispatchError("template_missing");
    throw e;
  }

  await queueMessages(db, campaignId, audience.data, type.is_essential);

  const { error: startError } = await db
    .from("campaigns")
    .update(
      campaign.status === "sending"
        ? { last_error_code: null }
        : {
            status: "sending",
            started_at: now().toISOString(),
            last_error_code: null,
          },
    )
    .eq("id", campaignId)
    .in("status", SENDABLE);
  if (startError) fail();

  const env = {
    siteUrl: options.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "",
    rsvpPath: options.rsvpPath ?? process.env.GUEST_RSVP_PATH ?? "/rsvp",
  };

  for (;;) {
    const { data: claimed, error: claimError } = await db.rpc(
      "claim_campaign_messages",
      { campaign_id: campaignId, limit: batchSize },
    );
    if (claimError) fail();
    const batch = (claimed ?? []) as ClaimedMessage[];
    if (batch.length === 0) break;
    for (const message of batch) {
      await deliver(db, message, type.template_key, env, options, now);
    }
  }

  const { error: doneError } = await db
    .from("campaigns")
    .update({ status: "done", completed_at: now().toISOString() })
    .eq("id", campaignId);
  if (doneError) fail();

  const result = await tally(db, campaignId);
  log.info("campaign_sent", {
    campaign_id: campaignId,
    queued: result.queued,
    sent: result.sent,
    failed: result.failed,
  });
  return result;
}

/** Resolves the audience and inserts one message per household, once. */
async function queueMessages(
  db: LooseDb,
  campaignId: string,
  audience: unknown,
  isEssential: boolean,
) {
  const { data, error } = await db.rpc("resolve_audience", {
    filter: audience,
  });
  if (error) fail();
  const audienceRows = (data ?? []) as AudienceRow[];

  // The opt-out is applied here as well, so it holds whether or not the
  // database function knows the message type.
  let optedOut = new Set<string>();
  const candidates = audienceRows
    .filter((r) => r.deliverable)
    .map((r) => r.household_id);
  if (!isEssential && candidates.length > 0) {
    const { data: households, error: householdError } = await db
      .from("households")
      .select("id, reminders_opt_out")
      .in("id", candidates);
    if (householdError) fail();
    optedOut = new Set(
      ((households ?? []) as Row[])
        .filter((h) => h.reminders_opt_out === true)
        .map((h) => h.id as string),
    );
  }

  const rows = audienceRows.map((r) => {
    if (r.deliverable && !optedOut.has(r.household_id)) {
      return {
        campaign_id: campaignId,
        household_id: r.household_id,
        status: "queued",
      };
    }
    return {
      campaign_id: campaignId,
      household_id: r.household_id,
      status: "skipped",
      skip_reason: r.deliverable ? "opted_out" : (r.skip_reason ?? "other"),
    };
  });
  if (rows.length === 0) return;

  const { error: upsertError } = await db.from("messages").upsert(rows, {
    onConflict: "campaign_id,household_id",
    ignoreDuplicates: true,
  });
  if (upsertError) fail();
}

async function deliver(
  db: LooseDb,
  message: ClaimedMessage,
  templateKey: string,
  env: { siteUrl: string; rsvpPath: string },
  options: DispatchOptions,
  now: () => Date,
) {
  const record = async (patch: Row) => {
    const { error } = await db
      .from("messages")
      .update(patch)
      .eq("id", message.id);
    if (error) log.error("message_update_failed", { message_id: message.id });
  };

  if (!message.to_email) {
    await record({ status: "skipped", skip_reason: "no_email" });
    return;
  }
  const props = message.household_id
    ? await loadCampaignProps(db, message.household_id, env)
    : null;
  if (!props) {
    await record({ status: "skipped", skip_reason: "household_missing" });
    return;
  }

  let rendered;
  try {
    rendered = await renderTemplate(templateKey, props, options.templates);
  } catch (e) {
    const code = e instanceof TemplateError ? e.code : "template_failed";
    await record({ status: "failed", error_code: code });
    return;
  }

  const result = await sendEmail({
    to: message.to_email,
    rendered,
    idempotencyKey: message.id,
    client: options.emailClient,
  });
  if (result.ok) {
    await record({
      status: "sent",
      provider_message_id: result.providerMessageId,
      sent_at: now().toISOString(),
    });
  } else {
    await record({ status: "failed", error_code: result.code });
  }
}

/** Counts from the stored messages, so a repeat run reports the same totals. */
async function tally(db: LooseDb, campaignId: string): Promise<DispatchResult> {
  const { data, error } = await db
    .from("messages")
    .select("status, skip_reason")
    .eq("campaign_id", campaignId);
  if (error) fail();
  const result: DispatchResult = {
    campaign_id: campaignId,
    queued: 0,
    sent: 0,
    skipped: { no_email: 0, opted_out: 0, other: 0 },
    failed: 0,
  };
  for (const m of (data ?? []) as Row[]) {
    if (m.status === "skipped") {
      if (m.skip_reason === "no_email") result.skipped.no_email++;
      else if (m.skip_reason === "opted_out") result.skipped.opted_out++;
      else result.skipped.other++;
      continue;
    }
    result.queued++;
    if (m.status === "failed") result.failed++;
    else if (SENT_STATUSES.includes(m.status as string)) result.sent++;
  }
  return result;
}

export type DueOutcome =
  | { campaign_id: string; ok: true; result: DispatchResult }
  | { campaign_id: string; ok: false; code: DispatchErrorCode };

/**
 * Runs every due scheduled campaign (and any left `sending`), then records the run time. A campaign that
 * cannot be sent stays `scheduled` with `last_error_code` set, and the others
 * still run.
 */
export async function dispatchDueCampaigns(
  db: LooseDb,
  options: DispatchOptions = {},
): Promise<{ campaigns: DueOutcome[] }> {
  const now = options.now ?? (() => new Date());
  const { data, error } = await db.rpc("due_scheduled_campaigns");
  if (error) fail();

  // Also pick up campaigns a crash left in `sending`.
  const { data: interrupted, error: interruptedError } = await db
    .from("campaigns")
    .select("id")
    .eq("status", "sending");
  if (interruptedError) fail();
  const dueIds = new Set(
    [
      ...((data ?? []) as { id: string }[]),
      ...((interrupted ?? []) as { id: string }[]),
    ].map((c) => c.id),
  );

  const outcomes: DueOutcome[] = [];
  for (const id of dueIds) {
    const due = { id };
    try {
      const result = await sendCampaign(db, due.id, options);
      outcomes.push({ campaign_id: due.id, ok: true, result });
    } catch (e) {
      const code = e instanceof DispatchError ? e.code : "server_error";
      log.error("scheduled_campaign_failed", { campaign_id: due.id, code });
      await db
        .from("campaigns")
        .update({ last_error_code: code })
        .eq("id", due.id);
      outcomes.push({ campaign_id: due.id, ok: false, code });
    }
  }

  const { error: stampError } = await db
    .from("settings")
    .update({ last_dispatch_at: now().toISOString() })
    .eq("id", true);
  if (stampError) log.error("last_dispatch_update_failed");
  return { campaigns: outcomes };
}
