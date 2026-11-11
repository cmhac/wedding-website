/** @jest-environment node */
/**
 * Everything that worked by email before texting must work the same whether or
 * not the provider is configured, and a fault on the text side must never delay,
 * block or change an email (spec: FR-045). Here the whole text side is made to
 * throw, and the email paths must not even touch it.
 */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/log");

jest.mock("@/lib/sms/state", () => ({
  getSmsState: () => {
    throw new Error("the text side must not be read for email");
  },
  isSmsConfigured: () => false,
}));
jest.mock("@/lib/sms/send", () => ({
  sendText: () => {
    throw new Error("the text side must not be used for email");
  },
}));

import { campaignFixture } from "@/lib/email/__tests__/fixtures/templates";
import { sendCampaign } from "@/lib/campaigns/dispatch";
import { createFakeDb } from "@/lib/campaigns/__tests__/fixtures/fake-db";

describe("an email campaign with the whole text side broken", () => {
  it("is sent exactly as before and never reads the text state", async () => {
    process.env.EMAIL_FROM = "Test <noreply@example.test>";
    process.env.INVITE_LINK_SECRET =
      "test-invite-secret-long-enough-for-hmac-0123456789";
    const db = createFakeDb(
      {
        households: [
          {
            id: "h-1",
            display_name: "H",
            invite_link_version: 1,
            reminders_opt_out: false,
            rsvp_deadline_override: null,
          },
        ],
        household_contacts: [
          {
            id: "c-1",
            household_id: "h-1",
            kind: "email",
            value: "a@example.com",
            created_at: "2027-01-01T00:00:00Z",
          },
        ],
        guests: [],
        invitations: [],
        events: [],
        settings: [{ id: true, default_rsvp_deadline: null }],
        message_types: [
          {
            key: "invitation",
            template_key: "invitation_template",
            is_essential: true,
          },
        ],
        campaigns: [
          {
            id: "c",
            status: "draft",
            message_type_key: "invitation",
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
        claim_campaign_messages: (args) => {
          const m = db.tables.messages.find(
            (x) => x.campaign_id === args.campaign_id && x.status === "queued",
          );
          if (!m) return [];
          m.status = "sending";
          m.to_email = "a@example.com";
          return [
            {
              id: m.id,
              household_id: m.household_id,
              to_email: "a@example.com",
            },
          ];
        },
      },
    );
    const send = jest.fn(async () => ({ data: { id: "p" }, error: null }));
    const result = await sendCampaign(db, "c", {
      templates: { invitation_template: campaignFixture },
      emailClient: { emails: { send } },
      siteUrl: "https://example.test",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(db.tables.campaigns[0].status).toBe("done");
  });
});
