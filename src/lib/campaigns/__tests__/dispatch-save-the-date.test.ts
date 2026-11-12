/** @jest-environment node */
jest.mock("@/lib/log");
jest.mock("server-only", () => ({}), { virtual: true });

import type { CampaignProps, EmailTemplate } from "@/lib/email/templates";
import { DispatchError, sendCampaign } from "../dispatch";
import { createFakeDb, type FakeDb } from "./fixtures/fake-db";

type Row = Record<string, unknown>;

const CAMPAIGN = "c-1";
const received: unknown[] = [];
const capture: EmailTemplate<CampaignProps> = async (props) => {
  received.push(props);
  return { subject: "fixture", html: "<p>fixture</p>", text: "fixture" };
};

const DETAILS = {
  couple_names: "Chris & Hannah",
  date: "2027-09-18",
  place: "Napa Valley, California",
  note: "Invitation to follow",
  revision: 2,
  wedding_event_set: true,
};

function setup(options: { typeKey: string; channel: string; templates?: Row }) {
  const db: FakeDb = createFakeDb(
    {
      households: [
        {
          id: "h-1",
          display_name: "Household One",
          invite_link_version: 1,
          reminders_opt_out: false,
          rsvp_deadline_override: null,
        },
      ],
      household_contacts: [
        {
          id: "e-1",
          household_id: "h-1",
          kind: "email",
          value: "h1@example.test",
          created_at: "2027-01-01T00:00:00Z",
        },
        {
          id: "p-1",
          household_id: "h-1",
          kind: "phone",
          value: "+12025550101",
          sms_consent: "opted_in",
          created_at: "2027-01-01T00:00:01Z",
        },
      ],
      guests: [],
      invitations: [],
      events: [],
      settings: [{ id: true, default_rsvp_deadline: null }],
      message_types: [
        {
          key: "save_the_date",
          template_key: "save_the_date",
          is_essential: true,
        },
        { key: "invitation", template_key: "invitation", is_essential: true },
      ],
      campaigns: [
        {
          id: CAMPAIGN,
          status: "draft",
          message_type_key: options.typeKey,
          channel: options.channel,
          audience: { scope: "all" },
          last_error_code: null,
        },
      ],
      messages: [],
    },
    {
      resolve_audience: () => [
        { household_id: "h-1", deliverable: true, skip_reason: null },
      ],
      get_save_the_date: () => DETAILS,
      claim_campaign_messages: (args) => {
        const picked = db.tables.messages
          .filter(
            (m) => m.campaign_id === args.campaign_id && m.status === "queued",
          )
          .slice(0, Number(args.limit));
        for (const m of picked) {
          const c = db.tables.household_contacts.find(
            (x) => x.id === m.contact_id,
          )!;
          m.status = "sending";
          if (m.channel === "text") m.to_phone = c.value;
          else m.to_email = c.value;
        }
        return picked.map((m) => ({
          id: m.id,
          household_id: m.household_id,
          channel: m.channel ?? "email",
          to_email: m.to_email ?? null,
          to_phone: m.to_phone ?? null,
        }));
      },
    },
  );
  const textSender = jest.fn(async () => ({ ok: true as const, sid: "SM1" }));
  const emailSend = jest.fn(async () => ({ data: { id: "id" }, error: null }));
  const run = () =>
    sendCampaign(db, CAMPAIGN, {
      templates: (options.templates ?? {
        save_the_date: capture,
        invitation: capture,
      }) as never,
      emailClient: { emails: { send: emailSend } },
      siteUrl: "https://example.test",
      smsAvailable: true,
      textSender,
      sleep: async () => {},
    });
  const failDetails = () =>
    db.failNext("get_save_the_date", { message: "boom" });
  return { db, textSender, emailSend, run, failDetails };
}

beforeEach(() => {
  received.length = 0;
  process.env.EMAIL_FROM = "Test <noreply@example.test>";
  process.env.INVITE_LINK_SECRET =
    "test-invite-secret-long-enough-for-hmac-0123456789";
});

describe("a save the date campaign", () => {
  it("sends the email and the text, each with a link that lands on the save the date page", async () => {
    const { textSender, emailSend, run } = setup({
      typeKey: "save_the_date",
      channel: "both",
    });
    await run();
    expect(emailSend).toHaveBeenCalledTimes(1);
    const props = received[0] as CampaignProps & {
      details: Record<string, unknown>;
      site_url: string;
    };
    expect(props.personal_link).toMatch(
      /^https:\/\/example\.test\/i\/\S+\?next=\/save-the-date$/,
    );
    expect(props.details).toMatchObject({
      date: "2027-09-18",
      place: "Napa Valley, California",
    });
    expect(props.site_url).toBe("https://example.test");

    expect(textSender).toHaveBeenCalledTimes(1);
    const body = (
      textSender.mock.calls as unknown as [{ body: string }][]
    )[0][0].body;
    expect(body).toMatch(
      /https:\/\/example\.test\/i\/\S+\?next=\/save-the-date/,
    );
    expect(body).toMatch(/Chris & Hannah/);
  });

  it("is refused, creating nothing, when email is chosen and no email template is registered", async () => {
    const { db, textSender, run } = setup({
      typeKey: "save_the_date",
      channel: "both",
      templates: {},
    });
    await expect(run()).rejects.toThrow(
      expect.objectContaining({ code: "template_missing" }),
    );
    expect(db.tables.messages).toHaveLength(0);
    expect(textSender).not.toHaveBeenCalled();
    expect(DispatchError).toBeDefined();
  });

  it("sends no email when the card's facts cannot be read, rather than sending one with no date", async () => {
    const { db, emailSend, run, failDetails } = setup({
      typeKey: "save_the_date",
      channel: "email",
    });
    failDetails();
    await expect(run()).rejects.toThrow(
      expect.objectContaining({ code: "server_error" }),
    );
    expect(emailSend).not.toHaveBeenCalled();
    expect(db.tables.messages.every((m) => m.status !== "sent")).toBe(true);
  });

  it("sends by text alone without needing an email template", async () => {
    const { textSender, emailSend, run } = setup({
      typeKey: "save_the_date",
      channel: "text",
      templates: {},
    });
    await run();
    expect(textSender).toHaveBeenCalledTimes(1);
    expect(emailSend).not.toHaveBeenCalled();
  });
});

describe("an invitation campaign", () => {
  it("keeps the plain personal link and gets no save the date details", async () => {
    const { textSender, run } = setup({
      typeKey: "invitation",
      channel: "both",
    });
    await run();
    const props = received[0] as CampaignProps & { details?: unknown };
    expect(props.personal_link).not.toContain("next=");
    expect(props.details).toBeUndefined();
    const body = (
      textSender.mock.calls as unknown as [{ body: string }][]
    )[0][0].body;
    expect(body).not.toContain("next=");
  });
});
