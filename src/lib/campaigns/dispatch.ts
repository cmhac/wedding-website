import { sendEmail, type EmailClient } from "@/lib/email/send";
import {
  getTemplate,
  renderTemplate,
  TemplateError,
  type TemplateRegistry,
} from "@/lib/email/templates";
import { shapeSaveTheDate, type SaveTheDate } from "@/lib/calendar/details";
import { log } from "@/lib/log";
import { getText, renderText, type TextRegistry } from "@/lib/sms/texts";
import { statusCallbackUrl } from "@/lib/sms/urls";
import type { SendTextResult } from "@/lib/sms/send";
import { audienceSchema } from "./audience";
import { loadCampaignProps, type LooseDb } from "./props";

/**
 * Sends a campaign (contracts/http-endpoints.md). One message is
 * queued per address of each deliverable household (a household with several
 * addresses gets one email per address, each with the household's personal
 * link), and every step is safe to repeat: messages are queued through the
 * unique (campaign, household, address) constraint, claimed with `claim_campaign_messages` so concurrent runs never
 * double-send, and sent with the message id as the idempotency key.
 *
 * A campaign has a channel: email, text or both. Email goes to every address as
 * above. Text goes only to phone numbers that have opted in (a number that has
 * not is skipped with a plain reason), one text per number, paced at one every
 * `textIntervalMs` and for at most `textBudgetMs` per run: whatever is left
 * stays queued and the campaign stays `sending`, so the scheduled run carries
 * on (research: Pacing). A text has no idempotency key, so a text claimed but
 * never confirmed is never retried automatically (the database marks it failed).
 *
 * Only ids, counts and outcome codes are logged: never addresses, numbers or
 * names. Expects a service-role client.
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

/** What every delivery in one run shares. */
type SendEnv = {
  siteUrl: string;
  rsvpPath: string;
  messageTypeKey?: string;
  saveTheDate?: SaveTheDate;
};

export type DispatchResult = {
  campaign_id: string;
  /** Households the campaign reached or considered. */
  households: number;
  /** Addresses a message was queued for (paper-only and skipped households have none). */
  addresses: number;
  queued: number;
  sent: number;
  skipped: { no_email: number; opted_out: number; other: number };
  failed: number;
  /** Messages still queued or sending when the run stopped (texts left for the next run). */
  remaining?: number;
};

export type DispatchOptions = {
  templates?: TemplateRegistry;
  emailClient?: EmailClient;
  batchSize?: number;
  siteUrl?: string;
  rsvpPath?: string;
  now?: () => Date;
  /** Text sending, for tests: whether texting is available, the sender, a sleep and the pace. */
  smsAvailable?: boolean;
  textSender?: (args: {
    to: string;
    body: string;
    statusCallback?: string;
  }) => Promise<SendTextResult>;
  texts?: TextRegistry;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds between campaign texts (default 2000: half of Twilio's one a second). */
  textIntervalMs?: number;
  /** Time a run may spend sending texts (default 45000). */
  textBudgetMs?: number;
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
  channel?: "email" | "text";
  to_email: string | null;
  to_phone?: string | null;
};

type Channel = "email" | "text" | "both";
const TEXT_INTERVAL_MS = 2000;
const TEXT_BUDGET_MS = 45_000;

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function defaultSmsAvailable(): Promise<boolean> {
  const { getSmsState } = await import("@/lib/sms/state");
  return (await getSmsState()).available;
}

async function defaultSendText(args: {
  to: string;
  body: string;
  statusCallback?: string;
}): Promise<SendTextResult> {
  const { sendText } = await import("@/lib/sms/send");
  return sendText(args);
}

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
    .select("id, status, message_type_key, audience, channel")
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

  const channel: Channel =
    campaign.channel === "text" || campaign.channel === "both"
      ? campaign.channel
      : "email";
  const wantsEmail = channel !== "text";
  const wantsText = channel !== "email";

  // Check the wording exists for every chosen channel before any message row is
  // created: a missing one refuses the whole send, on both channels.
  try {
    if (wantsEmail) getTemplate(type.template_key, options.templates);
    if (wantsText) getText(type.template_key, options.texts);
  } catch (e) {
    if (e instanceof TemplateError) throw new DispatchError("template_missing");
    throw e;
  }

  const smsAvailable = wantsText
    ? (options.smsAvailable ?? (await defaultSmsAvailable().catch(() => false)))
    : false;

  await queueMessages(db, campaignId, audience.data, type.is_essential, {
    wantsEmail,
    wantsText,
    smsAvailable,
  });

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

  const env: SendEnv = {
    siteUrl: options.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "",
    rsvpPath: options.rsvpPath ?? process.env.GUEST_RSVP_PATH ?? "/rsvp",
    // The message type decides where a personal link lands.
    messageTypeKey: campaign.message_type_key,
  };
  // A save the date email is given the card's facts, read once for the run.
  if (wantsEmail && campaign.message_type_key === "save_the_date") {
    const { data: details } = await db.rpc("get_save_the_date");
    env.saveTheDate = shapeSaveTheDate(details, env.siteUrl);
  }

  // With texts in play, claim one message at a time so a claimed text is always
  // sent (or given back) within this run: a claimed text that was never sent
  // would otherwise be marked "not confirmed" later.
  const interval = options.textIntervalMs ?? TEXT_INTERVAL_MS;
  const budget = options.textBudgetMs ?? TEXT_BUDGET_MS;
  const sleep = options.sleep ?? realSleep;
  const startedAt = now().getTime();
  let textsSent = 0;
  let stopped = false;

  while (!stopped) {
    const { data: claimed, error: claimError } = await db.rpc(
      "claim_campaign_messages",
      { campaign_id: campaignId, limit: wantsText ? 1 : batchSize },
    );
    if (claimError) fail();
    const batch = (claimed ?? []) as ClaimedMessage[];
    if (batch.length === 0) break;
    for (const message of batch) {
      if (message.channel === "text") {
        const elapsed = now().getTime() - startedAt;
        const pace = textsSent > 0 ? interval : 0;
        if (elapsed + pace >= budget && (textsSent > 0 || elapsed >= budget)) {
          // No room left in this run: give the text back for the next one.
          await db
            .from("messages")
            .update({ status: "queued", to_phone: null, claimed_at: null })
            .eq("id", message.id);
          stopped = true;
          break;
        }
        if (pace > 0) await sleep(pace);
        await deliverText(db, message, type.template_key, env, options, now);
        textsSent++;
      } else {
        await deliver(db, message, type.template_key, env, options, now);
      }
    }
  }

  // The campaign is done only when nothing is left to send; otherwise it stays
  // `sending` and the scheduled run continues it.
  const { data: left, error: leftError } = await db
    .from("messages")
    .select("id")
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "sending"]);
  if (leftError) fail();
  const remaining = ((left ?? []) as Row[]).length;
  if (remaining === 0) {
    const { error: doneError } = await db
      .from("campaigns")
      .update({ status: "done", completed_at: now().toISOString() })
      .eq("id", campaignId);
    if (doneError) fail();
  }

  const result = await tally(db, campaignId);
  if (remaining > 0) result.remaining = remaining;
  log.info("campaign_sent", {
    campaign_id: campaignId,
    queued: result.queued,
    sent: result.sent,
    failed: result.failed,
  });
  return result;
}

type QueueOptions = {
  wantsEmail: boolean;
  wantsText: boolean;
  smsAvailable: boolean;
};

/**
 * Resolves the audience and inserts the messages. Email: one per address of each
 * deliverable household, and one skipped row (no address) for each household
 * that cannot be emailed. Text: one per phone number that has opted in; every
 * other number of an eligible household is a skipped row saying why (not opted
 * in, declined, or texting unavailable), and a household with no phone has one
 * skipped row. Inserting is idempotent.
 */
async function queueMessages(
  db: LooseDb,
  campaignId: string,
  audience: unknown,
  isEssential: boolean,
  channels: QueueOptions,
) {
  const { data, error } = await db.rpc("resolve_audience", {
    filter: audience,
  });
  if (error) fail();
  const audienceRows = (data ?? []) as AudienceRow[];

  // A household that is only out of the email audience for lack of an address
  // can still be texted, so it counts as eligible for text.
  const eligibleForText = (r: AudienceRow) =>
    r.deliverable || r.skip_reason === "no_email";

  // The opt-out is applied here as well, so it holds whether or not the
  // database function knows the message type.
  let optedOut = new Set<string>();
  const candidates = audienceRows
    .filter(
      (r) =>
        (channels.wantsEmail ? r.deliverable : false) ||
        (channels.wantsText && eligibleForText(r)),
    )
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

  const emailable = audienceRows
    .filter((r) => r.deliverable && !optedOut.has(r.household_id))
    .map((r) => r.household_id);
  const addressesByHousehold = new Map<string, string[]>();
  if (channels.wantsEmail && emailable.length > 0) {
    const { data: contacts, error: contactError } = await db
      .from("household_contacts")
      .select("id, household_id")
      .eq("kind", "email")
      .in("household_id", emailable)
      .order("created_at", { ascending: true });
    if (contactError) fail();
    for (const c of (contacts ?? []) as Row[]) {
      const key = c.household_id as string;
      const list = addressesByHousehold.get(key) ?? [];
      list.push(c.id as string);
      addressesByHousehold.set(key, list);
    }
  }

  const textable = audienceRows
    .filter((r) => eligibleForText(r) && !optedOut.has(r.household_id))
    .map((r) => r.household_id);
  const phonesByHousehold = new Map<
    string,
    { id: string; consent: string }[]
  >();
  if (channels.wantsText && textable.length > 0) {
    const { data: phones, error: phoneError } = await db
      .from("household_contacts")
      .select("id, household_id, sms_consent")
      .eq("kind", "phone")
      .in("household_id", textable)
      .order("created_at", { ascending: true });
    if (phoneError) fail();
    for (const c of (phones ?? []) as Row[]) {
      const key = c.household_id as string;
      const list = phonesByHousehold.get(key) ?? [];
      list.push({ id: c.id as string, consent: String(c.sms_consent) });
      phonesByHousehold.set(key, list);
    }
  }

  const rows: Row[] = [];
  const noContactRow = new Set<string>();
  const skippedRow = (householdId: string, reason: string) => {
    // One row with no address or number per household and campaign.
    if (noContactRow.has(householdId)) return;
    noContactRow.add(householdId);
    rows.push({
      campaign_id: campaignId,
      household_id: householdId,
      contact_id: null,
      status: "skipped",
      skip_reason: reason,
    });
  };

  for (const r of audienceRows) {
    const id = r.household_id;
    const out = optedOut.has(id);

    if (channels.wantsEmail) {
      if (r.deliverable && !out) {
        const addresses = addressesByHousehold.get(id) ?? [];
        // Deliverable but no address any more (removed since the audience was
        // resolved): one skipped row.
        if (addresses.length === 0) skippedRow(id, "no_email");
        for (const contactId of addresses) {
          rows.push({
            campaign_id: campaignId,
            household_id: id,
            contact_id: contactId,
            status: "queued",
          });
        }
      } else if (!channels.wantsText || !eligibleForText(r) || out) {
        skippedRow(
          id,
          r.deliverable ? "opted_out" : (r.skip_reason ?? "other"),
        );
      } else {
        // Not emailable, but eligible for text below: the household's own
        // reason is "no email address", recorded once.
        skippedRow(id, r.skip_reason ?? "no_email");
      }
    }

    if (channels.wantsText) {
      if (!eligibleForText(r) || out) {
        if (!channels.wantsEmail) {
          skippedRow(id, out ? "opted_out" : (r.skip_reason ?? "other"));
        }
        continue;
      }
      const phones = phonesByHousehold.get(id) ?? [];
      if (phones.length === 0) {
        if (!channels.wantsEmail) skippedRow(id, "no_phone");
        continue;
      }
      for (const phone of phones) {
        const base = {
          campaign_id: campaignId,
          household_id: id,
          contact_id: phone.id,
          channel: "text",
        };
        if (!channels.smsAvailable) {
          rows.push({
            ...base,
            status: "skipped",
            skip_reason: "texting_unavailable",
          });
        } else if (phone.consent === "opted_in") {
          rows.push({ ...base, status: "queued" });
        } else {
          rows.push({
            ...base,
            status: "skipped",
            skip_reason:
              phone.consent === "declined" ? "declined" : "not_opted_in",
          });
        }
      }
    }
  }
  if (rows.length === 0) return;

  const { error: upsertError } = await db.from("messages").upsert(rows, {
    onConflict: "campaign_id,household_id,contact_id",
    ignoreDuplicates: true,
  });
  if (upsertError) fail();
}

async function deliver(
  db: LooseDb,
  message: ClaimedMessage,
  templateKey: string,
  env: SendEnv,
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
    const emailProps = env.saveTheDate
      ? { ...props, details: env.saveTheDate, site_url: env.siteUrl }
      : props;
    rendered = await renderTemplate(templateKey, emailProps, options.templates);
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

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});

/** What each campaign text is given: the household's link and, for a reminder, a short date. */
function textProps(props: {
  personal_link: string;
  respond_by: string | null;
}) {
  return {
    personal_link: props.personal_link,
    respond_by: props.respond_by
      ? SHORT_DATE.format(new Date(props.respond_by))
      : null,
  };
}

/**
 * Sends one campaign text. There is no way to make a retry safe, so the row was
 * claimed first and is never re-sent automatically. A failure is recorded with
 * Twilio's code (or `opted_out`) and flags the number for follow-up.
 */
async function deliverText(
  db: LooseDb,
  message: ClaimedMessage,
  templateKey: string,
  env: SendEnv,
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

  if (!message.to_phone) {
    await record({ status: "skipped", skip_reason: "no_phone" });
    return;
  }
  const props = message.household_id
    ? await loadCampaignProps(db, message.household_id, env)
    : null;
  if (!props) {
    await record({ status: "skipped", skip_reason: "household_missing" });
    return;
  }

  let body: string;
  try {
    body = renderText(templateKey, textProps(props), options.texts);
  } catch (e) {
    const code = e instanceof TemplateError ? e.code : "template_failed";
    await record({ status: "failed", error_code: code });
    return;
  }

  let result: SendTextResult;
  try {
    result = await (options.textSender ?? defaultSendText)({
      to: message.to_phone,
      body,
      statusCallback: statusCallbackUrl(),
    });
  } catch {
    result = { ok: false, code: "send_failed" };
  }

  if (result.ok) {
    await record({
      status: "sent",
      provider_message_id: result.sid,
      sent_at: now().toISOString(),
    });
    return;
  }
  await record({ status: "failed", error_code: result.code });
  if (message.household_id) {
    await db
      .from("household_contacts")
      .update({ delivery_problem: true })
      .eq("household_id", message.household_id)
      .eq("kind", "phone")
      .eq("value", message.to_phone);
  }
}

/** Counts from the stored messages, so a repeat run reports the same totals. */
async function tally(db: LooseDb, campaignId: string): Promise<DispatchResult> {
  const { data, error } = await db
    .from("messages")
    .select("status, skip_reason, household_id, contact_id")
    .eq("campaign_id", campaignId);
  if (error) fail();
  const households = new Set<string>();
  const result: DispatchResult = {
    campaign_id: campaignId,
    households: 0,
    addresses: 0,
    queued: 0,
    sent: 0,
    skipped: { no_email: 0, opted_out: 0, other: 0 },
    failed: 0,
  };
  for (const m of (data ?? []) as Row[]) {
    if (m.household_id) households.add(m.household_id as string);
    if (m.contact_id) result.addresses++;
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
  result.households = households.size;
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
