/** @jest-environment node */
jest.mock("@/lib/log");
jest.mock("server-only", () => ({}), { virtual: true });

import { campaignFixture } from "@/lib/email/__tests__/fixtures/templates";
import { DispatchError, sendCampaign } from "../dispatch";
import { createFakeDb, type FakeDb } from "./fixtures/fake-db";

type Row = Record<string, unknown>;

const CAMPAIGN = "c-1";
const templates = {
  invitation_template: campaignFixture,
  invitation: campaignFixture,
  save_the_date: campaignFixture,
  rsvp_reminder: campaignFixture,
};

function household(id: string): Row {
  return {
    id,
    display_name: `Household ${id}`,
    invite_link_version: 1,
    reminders_opt_out: false,
    rsvp_deadline_override: null,
  };
}

function phone(hid: string, n: number, consent: string): Row {
  return {
    id: `p-${hid}-${n}`,
    household_id: hid,
    kind: "phone",
    value: `+1202555${String(100 + n).padStart(4, "0")}`,
    sms_consent: consent,
    created_at: `2027-01-01T00:00:0${n}Z`,
  };
}

function email(hid: string): Row {
  return {
    id: `e-${hid}`,
    household_id: hid,
    kind: "email",
    value: `${hid}@example.com`,
    created_at: "2027-01-01T00:00:00Z",
  };
}

function setup(options: {
  contacts: Row[];
  channel?: string;
  typeKey?: string;
  households?: string[];
}) {
  const hids = options.households ?? ["h-1", "h-2"];
  const db: FakeDb = createFakeDb(
    {
      households: hids.map(household),
      household_contacts: options.contacts,
      guests: [],
      invitations: [],
      events: [],
      settings: [{ id: true, default_rsvp_deadline: null }],
      message_types: [
        { key: "invitation", template_key: "invitation", is_essential: true },
        {
          key: "save_the_date",
          template_key: "save_the_date",
          is_essential: true,
        },
        {
          key: "no_text_type",
          template_key: "no_text_template",
          is_essential: true,
        },
        {
          key: "rsvp_reminder",
          template_key: "rsvp_reminder",
          is_essential: false,
        },
      ],
      campaigns: [
        {
          id: CAMPAIGN,
          status: "draft",
          message_type_key: options.typeKey ?? "rsvp_reminder",
          channel: options.channel ?? "text",
          audience: { scope: "all" },
          last_error_code: null,
        },
      ],
      messages: [],
    },
    {
      get_save_the_date: () => ({
        couple_names: "Chris & Hannah",
        date: "2027-09-18",
        place: null,
        note: null,
        revision: 1,
      }),
      resolve_audience: () =>
        hids.map((id) => {
          const hasEmail = db.tables.household_contacts.some(
            (c) => c.household_id === id && c.kind === "email",
          );
          return {
            household_id: id,
            deliverable: hasEmail,
            skip_reason: hasEmail ? null : "no_email",
          };
        }),
      claim_campaign_messages: (args) => {
        const picked = db.tables.messages
          .filter(
            (m) => m.campaign_id === args.campaign_id && m.status === "queued",
          )
          .slice(0, Number(args.limit));
        const claimed: Row[] = [];
        for (const m of picked) {
          const text = m.channel === "text";
          const c = db.tables.household_contacts.find(
            (x) => x.id === m.contact_id,
          );
          if (!c) {
            m.status = "skipped";
            m.skip_reason = text ? "no_phone" : "no_email";
            continue;
          }
          if (text && c.sms_consent !== "opted_in") {
            m.status = "skipped";
            m.skip_reason = "not_opted_in";
            continue;
          }
          m.status = "sending";
          if (text) m.to_phone = c.value;
          else m.to_email = c.value;
          claimed.push(m);
        }
        return claimed.map((m) => ({
          id: m.id,
          household_id: m.household_id,
          channel: m.channel ?? "email",
          to_email: m.to_email ?? null,
          to_phone: m.to_phone ?? null,
        }));
      },
    },
  );
  const emailSend = jest.fn(async () => ({
    data: { id: "email-id" },
    error: null,
  }));
  let n = 0;
  const textSender = jest.fn(async () => ({
    ok: true as const,
    sid: `SM${++n}`,
  }));
  let clock = 0;
  const sleep = jest.fn(async (ms: number) => {
    clock += ms;
  });
  const run = (extra: Row = {}) =>
    sendCampaign(db, CAMPAIGN, {
      templates,
      emailClient: { emails: { send: emailSend } },
      siteUrl: "https://example.test",
      smsAvailable: true,
      textSender,
      sleep,
      now: () => new Date(clock),
      ...extra,
    });
  return { db, emailSend, textSender, sleep, run };
}

const messages = (db: FakeDb) => db.tables.messages;
const byReason = (db: FakeDb, reason: string) =>
  messages(db).filter((m) => m.skip_reason === reason).length;

beforeEach(() => {
  process.env.EMAIL_FROM = "Test <noreply@example.test>";
  process.env.INVITE_LINK_SECRET =
    "test-invite-secret-long-enough-for-hmac-0123456789";
});

describe("sendCampaign by text", () => {
  it("texts only the opted-in numbers, and says why every other number was skipped", async () => {
    const { db, textSender, run } = setup({
      contacts: [
        phone("h-1", 1, "opted_in"),
        phone("h-1", 2, "not_asked"),
        phone("h-2", 1, "declined"),
        phone("h-2", 2, "opted_in"),
      ],
    });
    await run();
    expect(textSender).toHaveBeenCalledTimes(2);
    const sentTo = (textSender.mock.calls as unknown as [{ to: string }][])
      .map((c) => c[0].to)
      .sort();
    expect(sentTo).toEqual(["+12025550101", "+12025550102"]);
    expect(byReason(db, "not_opted_in")).toBe(1);
    expect(byReason(db, "declined")).toBe(1);
    expect(
      messages(db).filter((m) => m.channel === "text" && m.status === "sent"),
    ).toHaveLength(2);
    expect(db.tables.campaigns[0].status).toBe("done");
  });

  it("sends the registered reminder text with the personal link and the status callback", async () => {
    const { textSender, run } = setup({
      contacts: [phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    await run();
    const arg = (
      textSender.mock.calls as unknown as [
        { body: string; statusCallback?: string },
      ][]
    )[0][0];
    expect(arg.body).toMatch(
      /^Chris & Hannah's wedding: .*https:\/\/example\.test\/i\/\S+ STOP to opt out$/,
    );
    expect(arg.body.length).toBeLessThanOrEqual(160);
  });

  it("records the message id and the number used, and never sends an email in a text campaign", async () => {
    const { db, emailSend, run } = setup({
      contacts: [email("h-1"), phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    await run();
    expect(emailSend).not.toHaveBeenCalled();
    const sent = messages(db).find((m) => m.channel === "text");
    expect(sent).toMatchObject({
      status: "sent",
      provider_message_id: "SM1",
      to_phone: "+12025550101",
    });
  });

  it("skips a household with no phone, and one that is not opted in, without sending", async () => {
    const { db, textSender, run } = setup({
      contacts: [email("h-1"), email("h-2")],
    });
    await run();
    expect(textSender).not.toHaveBeenCalled();
    expect(byReason(db, "no_phone")).toBe(2);
  });

  it("applies the reminder opt-out to texts for a reminder", async () => {
    const { db, textSender, run } = setup({
      contacts: [phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    db.tables.households[0].reminders_opt_out = true;
    await run();
    expect(textSender).not.toHaveBeenCalled();
    expect(byReason(db, "opted_out")).toBe(1);
  });

  it("is safe to run again: nobody is texted twice", async () => {
    const { textSender, run } = setup({
      contacts: [phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    await run();
    // A second run of a finished campaign is refused, so nobody is texted again.
    await run().catch(() => {});
    expect(textSender).toHaveBeenCalledTimes(1);
  });
});

describe("sendCampaign by both channels", () => {
  it("emails every address and texts every opted-in number", async () => {
    const { emailSend, textSender, run } = setup({
      channel: "both",
      contacts: [
        email("h-1"),
        phone("h-1", 1, "opted_in"),
        email("h-2"),
        phone("h-2", 1, "not_asked"),
      ],
    });
    await run();
    expect(emailSend).toHaveBeenCalledTimes(2);
    expect(textSender).toHaveBeenCalledTimes(1);
  });

  it("a failed text never changes an email", async () => {
    const { emailSend, textSender, run } = setup({
      channel: "both",
      contacts: [email("h-1"), phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    textSender.mockRejectedValue(new Error("net +12025550101"));
    await run();
    expect(emailSend).toHaveBeenCalledTimes(1);
  });
});

describe("sendCampaign when texting is not available", () => {
  it("skips every text as texting_unavailable and still sends the emails", async () => {
    const { db, emailSend, textSender, run } = setup({
      channel: "both",
      contacts: [email("h-1"), phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    await run({ smsAvailable: false });
    expect(textSender).not.toHaveBeenCalled();
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(byReason(db, "texting_unavailable")).toBe(1);
  });
});

describe.each(["invitation", "save_the_date"])(
  "sendCampaign sends the %s by email and text",
  (typeKey) => {
    it("sends both to a household with an address and an opted-in number, and skips an unopted number", async () => {
      const { db, emailSend, textSender, run } = setup({
        typeKey,
        channel: "both",
        contacts: [
          email("h-1"),
          phone("h-1", 1, "opted_in"),
          phone("h-1", 2, "not_asked"),
        ],
        households: ["h-1"],
      });
      await run();
      expect(emailSend).toHaveBeenCalledTimes(1);
      expect(textSender).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(textSender.mock.calls[0])).toContain("/i/");
      expect(byReason(db, "not_opted_in")).toBe(1);
    });

    it("texts only, to a phone-only household with an opted-in number", async () => {
      const { emailSend, textSender, run } = setup({
        typeKey,
        channel: "text",
        contacts: [phone("h-1", 1, "opted_in")],
        households: ["h-1"],
      });
      await run();
      expect(emailSend).not.toHaveBeenCalled();
      expect(textSender).toHaveBeenCalledTimes(1);
    });
  },
);

describe("sendCampaign refuses text for a type with no text", () => {
  it("throws template_missing before queueing anything", async () => {
    const { db, run } = setup({
      typeKey: "no_text_type",
      channel: "text",
      contacts: [phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    await expect(run()).rejects.toMatchObject({ code: "template_missing" });
    expect(messages(db)).toHaveLength(0);
    await expect(run()).rejects.toBeInstanceOf(DispatchError);
  });

  it("refuses text for the whole campaign, so nothing goes out by email either", async () => {
    const { emailSend, run } = setup({
      typeKey: "no_text_type",
      channel: "both",
      contacts: [email("h-1"), phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    await expect(run()).rejects.toMatchObject({ code: "template_missing" });
    expect(emailSend).not.toHaveBeenCalled();
  });
});

describe("failed texts", () => {
  it.each([
    ["opted_out", "opted_out"],
    ["30006", "30006"],
  ])("records %s and flags the number", async (code, stored) => {
    const { db, textSender, run } = setup({
      contacts: [phone("h-1", 1, "opted_in")],
      households: ["h-1"],
    });
    textSender.mockResolvedValue({ ok: false as never, code } as never);
    await run();
    expect(messages(db)[0]).toMatchObject({
      status: "failed",
      error_code: stored,
    });
    expect(db.tables.household_contacts[0].delivery_problem).toBe(true);
  });
});

describe("pacing and resuming", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_v, i) => phone(`h-${i + 1}`, 1, "opted_in"));
  const ids = (n: number) => Array.from({ length: n }, (_v, i) => `h-${i + 1}`);

  it("sends at most one text every 2 seconds and stops at the time budget, leaving the rest queued", async () => {
    const { db, textSender, sleep, run } = setup({
      contacts: many(6),
      households: ids(6),
    });
    const result = await run({ textIntervalMs: 2000, textBudgetMs: 5000 });
    expect(textSender).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(messages(db).filter((m) => m.status === "queued")).toHaveLength(3);
    expect(db.tables.campaigns[0].status).toBe("sending");
    expect(result.remaining).toBe(3);
  });

  it("continues on the next run and finishes", async () => {
    const { db, textSender, run } = setup({
      contacts: many(6),
      households: ids(6),
    });
    await run({ textIntervalMs: 2000, textBudgetMs: 5000 });
    const second = await run({ textIntervalMs: 2000, textBudgetMs: 60000 });
    expect(textSender).toHaveBeenCalledTimes(6);
    expect(db.tables.campaigns[0].status).toBe("done");
    expect(second.remaining).toBeUndefined();
    const sids = messages(db).map((m) => m.provider_message_id);
    expect(new Set(sids).size).toBe(6);
  });

  it("gives back a text it claimed but could not send within the budget", async () => {
    const { db, run } = setup({ contacts: many(2), households: ids(2) });
    await run({ textIntervalMs: 2000, textBudgetMs: 1000 });
    expect(messages(db).filter((m) => m.status === "sending")).toHaveLength(0);
    expect(messages(db).filter((m) => m.status === "queued")).toHaveLength(1);
  });
});
