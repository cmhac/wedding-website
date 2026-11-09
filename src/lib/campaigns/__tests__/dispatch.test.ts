/** @jest-environment node */
jest.mock("@/lib/log");

import {
  campaignFixture,
  received,
} from "@/lib/email/__tests__/fixtures/templates";
import { dispatchDueCampaigns, DispatchError, sendCampaign } from "../dispatch";
import { createFakeDb, type FakeDb } from "./fixtures/fake-db";

type Row = Record<string, unknown>;

const CAMPAIGN = "c-1";
const templates = {
  invitation_template: campaignFixture,
  reminder_template: campaignFixture,
};

function household(id: string, extra: Row = {}): Row {
  return {
    id,
    display_name: `Household ${id}`,
    invite_link_version: 1,
    reminders_opt_out: false,
    rsvp_deadline_override: null,
    ...extra,
  };
}

function setup(
  options: {
    households?: Row[];
    messageType?: Row;
    campaign?: Row;
    extraCampaigns?: Row[];
    rpcRows?: Row[];
    /** Addresses per household id; a household not listed has one, an empty list means paper only. */
    addresses?: Record<string, string[]>;
  } = {},
) {
  const households = options.households ?? [
    household("h-1"),
    household("h-2"),
    household("h-3"),
  ];
  const contacts: Row[] = households.flatMap((h) =>
    (options.addresses?.[h.id as string] ?? [`${h.id}@example.com`]).map(
      (value, i) => ({
        id: `c-${h.id}-${i + 1}`,
        household_id: h.id,
        kind: "email",
        value,
        created_at: `2027-01-01T00:00:0${i}Z`,
      }),
    ),
  );
  const db: FakeDb = createFakeDb(
    {
      households,
      household_contacts: contacts,
      guests: [],
      invitations: [],
      events: [],
      settings: [{ id: true, default_rsvp_deadline: null }],
      message_types: [
        options.messageType ?? {
          key: "invitation",
          template_key: "invitation_template",
          is_essential: true,
        },
        {
          key: "rsvp_reminder",
          template_key: "reminder_template",
          is_essential: false,
        },
        { key: "update", template_key: "missing_template", is_essential: true },
      ],
      campaigns: [
        {
          id: CAMPAIGN,
          status: "draft",
          message_type_key: "invitation",
          audience: { scope: "all" },
          last_error_code: null,
          ...options.campaign,
        },
        ...(options.extraCampaigns ?? []),
      ],
      messages: [],
    },
    {
      resolve_audience: () =>
        options.rpcRows ??
        households.map((h) => {
          const has = db.tables.household_contacts.some(
            (c) => c.household_id === h.id,
          );
          return {
            household_id: h.id,
            deliverable: has,
            skip_reason: has ? null : "no_email",
          };
        }),
      claim_campaign_messages: (args) => {
        const picked = db.tables.messages
          .filter(
            (m) => m.campaign_id === args.campaign_id && m.status === "queued",
          )
          .slice(0, Number(args.limit));
        // As the database does: the address is re-read, and a row whose
        // address is gone is skipped.
        const claimed: Row[] = [];
        for (const m of picked) {
          const c = db.tables.household_contacts.find(
            (x) => x.id === m.contact_id,
          );
          if (!c) {
            m.status = "skipped";
            m.skip_reason = "no_email";
            continue;
          }
          m.status = "sending";
          m.to_email = c.value;
          claimed.push(m);
        }
        return claimed.map((m) => ({
          id: m.id,
          household_id: m.household_id,
          to_email: m.to_email,
        }));
      },
      due_scheduled_campaigns: () =>
        db.tables.campaigns
          .filter((c) => c.status === "scheduled")
          .map((c) => ({ id: c.id })),
    },
  );
  const send = jest.fn(async () => ({
    data: { id: "provider-id" },
    error: null,
  }));
  const run = (id = CAMPAIGN, extra: Row = {}) =>
    sendCampaign(db, id, {
      templates,
      emailClient: { emails: { send } },
      siteUrl: "https://example.test",
      ...extra,
    });
  return { db, send, run };
}

const messages = (db: FakeDb) => db.tables.messages;

beforeEach(() => {
  process.env.EMAIL_FROM = "Test <noreply@example.test>";
  received.campaign.length = 0;
});

describe("sendCampaign", () => {
  it("creates one message per household and sends each once", async () => {
    const { db, send, run } = setup();
    const result = await run();
    expect(messages(db)).toHaveLength(3);
    expect(send).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      campaign_id: CAMPAIGN,
      households: 3,
      addresses: 3,
      queued: 3,
      sent: 3,
      skipped: { no_email: 0, opted_out: 0, other: 0 },
      failed: 0,
    });
  });

  it("sends one email per address of a household, each with the household's personal link", async () => {
    const { db, send, run } = setup({
      households: [household("h-1"), household("h-2")],
      addresses: { "h-1": ["one@example.com", "two@example.com"] },
    });
    const result = await run();
    const calls = send.mock.calls as unknown as [{ to: string }][];
    expect(calls.map((c) => c[0].to).sort()).toEqual([
      "h-2@example.com",
      "one@example.com",
      "two@example.com",
    ]);
    expect(messages(db)).toHaveLength(3);
    expect(
      messages(db)
        .filter((m) => m.household_id === "h-1")
        .map((m) => m.contact_id)
        .sort(),
    ).toEqual(["c-h-1-1", "c-h-1-2"]);
    expect(result).toMatchObject({
      households: 2,
      addresses: 3,
      queued: 3,
      sent: 3,
    });
    // Both of h-1's emails carry the same personal link.
    const links = received.campaign.map((p) => p.personal_link);
    expect(links).toHaveLength(3);
    expect(new Set(links).size).toBe(2);
  });

  it("sends each address once even when the campaign is run again", async () => {
    const { db, send, run } = setup({
      households: [household("h-1")],
      addresses: { "h-1": ["one@example.com", "two@example.com"] },
    });
    await run();
    db.tables.campaigns[0].status = "draft";
    const again = await run();
    expect(messages(db)).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(again).toMatchObject({ addresses: 2, sent: 2 });
  });

  it("records a paper-only household as one skipped row with no address", async () => {
    const { db, send, run } = setup({
      households: [household("h-1"), household("h-2")],
      addresses: { "h-2": [] },
    });
    const result = await run();
    expect(send).toHaveBeenCalledTimes(1);
    const paper = messages(db).filter((m) => m.household_id === "h-2");
    expect(paper).toHaveLength(1);
    expect(paper[0]).toMatchObject({
      contact_id: null,
      status: "skipped",
      skip_reason: "no_email",
    });
    expect(result).toMatchObject({ households: 2, addresses: 1, queued: 1 });
    expect(result.skipped.no_email).toBe(1);
  });

  it("queues messages without storing an address", async () => {
    const { db, run } = setup();
    await run();
    const queued = db.writes.find(
      (w) => w.table === "messages" && w.op === "upsert",
    );
    expect((queued!.value as Row[]).length).toBeGreaterThan(0);
    for (const row of queued!.value as Row[]) {
      expect(row).not.toHaveProperty("to_email");
      expect(row).toHaveProperty("contact_id");
    }
  });

  it("changes nothing when run again", async () => {
    const { db, send, run } = setup();
    const first = await run();
    db.tables.campaigns[0].status = "draft";
    const second = await run();
    expect(messages(db)).toHaveLength(3);
    expect(send).toHaveBeenCalledTimes(3);
    expect(second).toEqual(first);
  });

  it("sends with an idempotency key equal to the message id", async () => {
    const { db, send, run } = setup();
    await run();
    const keys = (
      send.mock.calls as unknown as [unknown, { idempotencyKey: string }][]
    )
      .map((c) => c[1].idempotencyKey)
      .sort();
    expect(keys).toEqual(
      messages(db)
        .map((m) => m.id as string)
        .sort(),
    );
  });

  it("records the provider message id and marks messages sent", async () => {
    const { db, run } = setup();
    await run();
    for (const m of messages(db)) {
      expect(m.status).toBe("sent");
      expect(m.provider_message_id).toBe("provider-id");
      expect(m.sent_at).toEqual(expect.any(String));
    }
  });

  it("skips households with no email and counts them", async () => {
    const { db, send, run } = setup({
      households: [household("h-1"), household("h-2")],
      addresses: { "h-2": [] },
    });
    const result = await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.skipped.no_email).toBe(1);
    expect(result.queued).toBe(1);
    const skipped = messages(db).find((m) => m.household_id === "h-2");
    expect(skipped).toMatchObject({
      status: "skipped",
      skip_reason: "no_email",
    });
  });

  it("skips opted-out households for non-essential types", async () => {
    const { send, run } = setup({
      campaign: { message_type_key: "rsvp_reminder" },
      households: [
        household("h-1"),
        household("h-2", { reminders_opt_out: true }),
      ],
    });
    const result = await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.skipped.opted_out).toBe(1);
  });

  it("ignores the opt-out for essential types", async () => {
    const { send, run } = setup({
      households: [household("h-1", { reminders_opt_out: true })],
    });
    const result = await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.skipped.opted_out).toBe(0);
  });

  it("counts households filtered out for another reason as other", async () => {
    const { run } = setup({
      rpcRows: [
        { household_id: "h-1", deliverable: false, skip_reason: null },
        { household_id: "h-2", deliverable: true, skip_reason: null },
      ],
    });
    const result = await run();
    expect(result.skipped.other).toBe(1);
    expect(result.sent).toBe(1);
  });

  it("uses the contact email as it is at send time", async () => {
    const { db, send, run } = setup({ households: [household("h-1")] });
    // A message queued earlier, before the address changed.
    db.tables.messages.push({
      id: "m-old",
      campaign_id: CAMPAIGN,
      household_id: "h-1",
      contact_id: "c-h-1-1",
      status: "queued",
      to_email: null,
    });
    db.tables.household_contacts[0].value = "changed@example.com";
    await run();
    const calls = send.mock.calls as unknown as [{ to: string }][];
    expect(calls[0][0].to).toBe("changed@example.com");
    expect(messages(db)[0].to_email).toBe("changed@example.com");
  });

  it("skips a household whose email was cleared after queueing", async () => {
    const { db, send, run } = setup({ households: [household("h-1")] });
    db.tables.messages.push({
      id: "m-old",
      campaign_id: CAMPAIGN,
      household_id: "h-1",
      contact_id: "c-h-1-1",
      status: "queued",
      to_email: null,
    });
    db.tables.household_contacts.length = 0;
    const result = await run();
    expect(send).not.toHaveBeenCalled();
    // The earlier message for the removed address, and the household's own row.
    expect(result.skipped.no_email).toBe(2);
    expect(messages(db).find((m) => m.id === "m-old")).toMatchObject({
      status: "skipped",
      skip_reason: "no_email",
    });
  });

  it("marks a Resend failure as failed with a code and carries on", async () => {
    const { db, send, run } = setup();
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "rate_limit_exceeded" },
    } as never);
    const result = await run();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(2);
    expect(messages(db).find((m) => m.status === "failed")).toMatchObject({
      error_code: "rate_limit_exceeded",
    });
    expect(db.tables.campaigns[0].status).toBe("done");
  });

  it("marks a throwing template as failed for that message only", async () => {
    const { db, run } = setup();
    const boom = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementation(campaignFixture);
    const result = await run(CAMPAIGN, {
      templates: { invitation_template: boom },
    });
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(2);
    expect(messages(db).find((m) => m.status === "failed")).toMatchObject({
      error_code: "template_failed",
    });
  });

  it("claims in batches until nothing is queued, then ends done", async () => {
    const { db, run } = setup();
    await run(CAMPAIGN, { batchSize: 2 });
    const claims = db.rpcCalls.filter(
      (c) => c.fn === "claim_campaign_messages",
    );
    expect(claims.length).toBe(3); // 2, 1, then an empty batch
    expect(db.tables.campaigns[0]).toMatchObject({
      status: "done",
      completed_at: expect.any(String),
    });
  });

  it("gives templates only the campaign props", async () => {
    const { run } = setup();
    await run();
    expect(received.campaign).toHaveLength(3);
    expect(Object.keys(received.campaign[0]).sort()).toEqual([
      "events",
      "household",
      "pending",
      "personal_link",
      "respond_by",
      "rsvp_url",
    ]);
    expect(received.campaign[0].rsvp_url).toBe("https://example.test/rsvp");
  });

  it("rejects a missing template before creating any message", async () => {
    const { db, run } = setup({ campaign: { message_type_key: "update" } });
    await expect(run()).rejects.toMatchObject({ code: "template_missing" });
    expect(messages(db)).toHaveLength(0);
    expect(db.tables.campaigns[0].status).toBe("draft");
  });

  it.each(["done", "cancelled"])("refuses a %s campaign", async (status) => {
    const { db, run } = setup({ campaign: { status } });
    await expect(run()).rejects.toMatchObject({
      code: "campaign_not_sendable",
    });
    expect(messages(db)).toHaveLength(0);
  });

  it("resumes a campaign left sending after a crash, without resending", async () => {
    const { db, send, run } = setup({ campaign: { status: "sending" } });
    // Two messages were already sent before the crash; one is still queued.
    db.tables.messages.push(
      {
        id: "m-1",
        campaign_id: CAMPAIGN,
        household_id: "h-1",
        contact_id: "c-h-1-1",
        status: "sent",
      },
      {
        id: "m-2",
        campaign_id: CAMPAIGN,
        household_id: "h-2",
        contact_id: "c-h-2-1",
        status: "sent",
      },
      {
        id: "m-3",
        campaign_id: CAMPAIGN,
        household_id: "h-3",
        contact_id: "c-h-3-1",
        status: "queued",
      },
    );
    const result = await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(messages(db)).toHaveLength(3);
    expect(result.sent).toBe(3);
    expect(db.tables.campaigns[0].status).toBe("done");
  });

  it("accepts a scheduled campaign", async () => {
    const { run } = setup({ campaign: { status: "scheduled" } });
    await expect(run()).resolves.toMatchObject({ sent: 3 });
  });

  it("refuses an unknown campaign", async () => {
    const { run } = setup();
    await expect(run("nope")).rejects.toBeInstanceOf(DispatchError);
    await expect(run("nope")).rejects.toMatchObject({
      code: "campaign_not_found",
    });
  });
});

describe("dispatchDueCampaigns", () => {
  const dueOptions = (send: jest.Mock) => ({
    templates,
    emailClient: { emails: { send } },
    siteUrl: "https://example.test",
  });

  it("sends due campaigns and records the dispatch time", async () => {
    const { db, send } = setup({ campaign: { status: "scheduled" } });
    const out = await dispatchDueCampaigns(db, dueOptions(send));
    expect(out.campaigns).toEqual([
      expect.objectContaining({ campaign_id: CAMPAIGN, ok: true }),
    ]);
    expect(db.tables.campaigns[0].status).toBe("done");
    expect(db.tables.settings[0].last_dispatch_at).toEqual(expect.any(String));
  });

  it("does nothing, apart from the timestamp, when none are due", async () => {
    const { db, send } = setup();
    const out = await dispatchDueCampaigns(db, dueOptions(send));
    expect(out.campaigns).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    expect(db.tables.settings[0].last_dispatch_at).toEqual(expect.any(String));
  });

  it("also resumes campaigns left sending", async () => {
    const { db, send } = setup({ campaign: { status: "sending" } });
    const out = await dispatchDueCampaigns(db, dueOptions(send));
    expect(out.campaigns).toEqual([
      expect.objectContaining({ campaign_id: CAMPAIGN, ok: true }),
    ]);
    expect(db.tables.campaigns[0].status).toBe("done");
  });

  it("leaves a campaign with no template scheduled and runs the others", async () => {
    const { db, send } = setup({
      campaign: { status: "scheduled", message_type_key: "update" },
      extraCampaigns: [
        {
          id: "c-2",
          status: "scheduled",
          message_type_key: "invitation",
          audience: { scope: "all" },
          last_error_code: null,
        },
      ],
    });
    const out = await dispatchDueCampaigns(db, dueOptions(send));
    const [missing, other] = db.tables.campaigns;
    expect(missing).toMatchObject({
      status: "scheduled",
      last_error_code: "template_missing",
    });
    expect(other.status).toBe("done");
    expect(out.campaigns).toEqual([
      { campaign_id: CAMPAIGN, ok: false, code: "template_missing" },
      expect.objectContaining({ campaign_id: "c-2", ok: true }),
    ]);
    expect(messages(db).every((m) => m.campaign_id === "c-2")).toBe(true);
  });
});
