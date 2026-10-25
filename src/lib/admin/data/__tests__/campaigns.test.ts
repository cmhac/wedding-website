/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminFakeDb } from "@/lib/admin/__tests__/fixtures/fake-db";

jest.mock("server-only", () => ({}), { virtual: true });

import {
  loadCampaign,
  loadCampaigns,
  loadDelivery,
  loadEventOptions,
  loadHouseholdOptions,
  loadMessageTypes,
} from "../campaigns";

const CAMPAIGN_A = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_B = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_C = "33333333-3333-4333-8333-333333333333";

const messageTypes = [
  {
    key: "rsvp_reminder",
    label: "RSVP reminder",
    is_essential: false,
    template_key: "rsvp_reminder",
  },
  {
    key: "invitation",
    label: "Invitation",
    is_essential: true,
    template_key: "invitation",
  },
];

const events = [
  { id: "e2", slug: "ceremony", name: "Ceremony", display_order: 2 },
  { id: "e1", slug: "rehearsal", name: "Rehearsal", display_order: 1 },
];

const campaigns = [
  {
    id: CAMPAIGN_A,
    name: "Required RSVP reminder",
    message_type_key: "rsvp_reminder",
    audience: {
      scope: "filter",
      filters: { required_events_unanswered: true },
    },
    status: "draft",
    scheduled_for: null,
    last_error_code: "template_missing",
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: CAMPAIGN_B,
    name: "Rehearsal invitations",
    message_type_key: "invitation",
    audience: { scope: "filter", filters: { invited_to_event: "rehearsal" } },
    status: "scheduled",
    scheduled_for: "2026-10-30T17:00:00Z",
    last_error_code: null,
    created_at: "2026-10-02T00:00:00Z",
  },
  {
    id: CAMPAIGN_C,
    name: "Save the date",
    message_type_key: "invitation",
    audience: { scope: "all" },
    status: "done",
    scheduled_for: "2026-08-02T16:00:00Z",
    last_error_code: "something_odd",
    created_at: "2026-09-01T00:00:00Z",
  },
];

const messages = [
  {
    id: "m1",
    campaign_id: CAMPAIGN_C,
    household_id: "h1",
    status: "delivered",
    skip_reason: null,
    error_code: null,
    queued_at: "2026-08-02T16:00:00Z",
    sent_at: "2026-08-02T16:01:00Z",
    last_event_at: "2026-08-02T16:02:00Z",
  },
  {
    id: "m2",
    campaign_id: CAMPAIGN_C,
    household_id: "h2",
    status: "skipped",
    skip_reason: "no_email",
    error_code: null,
    queued_at: "2026-08-02T16:00:00Z",
    sent_at: null,
    last_event_at: null,
  },
  {
    id: "m3",
    campaign_id: CAMPAIGN_C,
    household_id: "h3",
    status: "skipped",
    skip_reason: "opted_out",
    error_code: null,
    queued_at: "2026-08-02T16:00:00Z",
    sent_at: null,
    last_event_at: null,
  },
  {
    id: "m4",
    campaign_id: CAMPAIGN_C,
    household_id: "h4",
    status: "bounced",
    skip_reason: null,
    error_code: null,
    queued_at: "2026-08-02T16:00:00Z",
    sent_at: "2026-08-02T16:01:00Z",
    last_event_at: "2026-08-02T16:03:00Z",
  },
  {
    id: "m5",
    campaign_id: CAMPAIGN_C,
    household_id: "h5",
    status: "complained",
    skip_reason: null,
    error_code: null,
    queued_at: "2026-08-02T16:00:00Z",
    sent_at: "2026-08-02T16:01:00Z",
    last_event_at: "2026-08-02T16:04:00Z",
  },
  {
    id: "m6",
    campaign_id: CAMPAIGN_C,
    household_id: null,
    status: "failed",
    skip_reason: null,
    error_code: "provider_error",
    queued_at: "2026-08-02T16:00:00Z",
    sent_at: null,
    last_event_at: null,
  },
  {
    id: "m7",
    campaign_id: CAMPAIGN_A,
    household_id: "h1",
    status: "queued",
    skip_reason: null,
    error_code: null,
    queued_at: "2026-10-01T00:00:00Z",
    sent_at: null,
    last_event_at: null,
  },
];

const households = [
  { id: "h1", display_name: "The Examples" },
  { id: "h2", display_name: "Exampleton family" },
  { id: "h3", display_name: "Test, Pat and Lee" },
  { id: "h4", display_name: "Sample Family" },
  { id: "h5", display_name: "Fixture Household" },
];

function db() {
  const fake = createAdminFakeDb(
    {
      message_types: messageTypes,
      events,
      campaigns,
      messages,
    },
    {
      rpcResults: { staff_households: { data: households } },
    },
  );
  return { fake, client: fake as unknown as SupabaseClient };
}

describe("loadCampaigns", () => {
  it("returns each campaign with plain-English summaries, newest first", async () => {
    const { client } = db();
    const rows = await loadCampaigns(client);
    expect(rows.map((r) => r.name)).toEqual([
      "Rehearsal invitations",
      "Required RSVP reminder",
      "Save the date",
    ]);
    expect(rows[0]).toMatchObject({
      id: CAMPAIGN_B,
      messageTypeKey: "invitation",
      messageTypeLabel: "Invitation",
      audience: "Invited to Rehearsal",
      status: "scheduled",
      scheduledFor: "Oct 30, 10:00 AM PT",
      lastError: null,
    });
    expect(rows[1]).toMatchObject({
      audience: "Required answers outstanding",
      status: "draft",
      scheduledFor: null,
      lastError: "No email template is registered for this message type yet.",
    });
    expect(rows[2].audience).toBe("All households");
  });

  it("never shows a raw error code", async () => {
    const { client } = db();
    const rows = await loadCampaigns(client);
    expect(rows[2].lastError).not.toContain("something_odd");
    expect(rows[2].lastError).toBeTruthy();
  });

  it("throws when the campaigns cannot be read", async () => {
    const { fake, client } = db();
    fake.failNext("campaigns", { message: "boom" });
    await expect(loadCampaigns(client)).rejects.toThrow("campaigns_unreadable");
  });
});

describe("loadCampaign", () => {
  it("returns the editable fields with the send time as Pacific local", async () => {
    const { client } = db();
    expect(await loadCampaign(CAMPAIGN_B, client)).toEqual({
      id: CAMPAIGN_B,
      name: "Rehearsal invitations",
      messageTypeKey: "invitation",
      audience: { scope: "filter", filters: { invited_to_event: "rehearsal" } },
      status: "scheduled",
      scheduledLocal: "2026-10-30T10:00",
    });
  });

  it("returns null for a campaign that does not exist", async () => {
    const { client } = db();
    expect(
      await loadCampaign("99999999-9999-4999-8999-999999999999", client),
    ).toBeNull();
  });
});

describe("loadDelivery", () => {
  it("returns one row per message with plain details and Pacific times", async () => {
    const { client } = db();
    const delivery = await loadDelivery(CAMPAIGN_C, client);
    expect(delivery?.campaign).toEqual({
      id: CAMPAIGN_C,
      name: "Save the date",
      status: "done",
    });
    const byId = Object.fromEntries(delivery!.rows.map((r) => [r.id, r]));
    expect(byId.m1).toMatchObject({
      householdId: "h1",
      householdName: "The Examples",
      status: "delivered",
      detail: "",
      at: "Aug 2, 9:02 AM PT",
    });
    expect(byId.m2.detail).toBe("No email on file");
    expect(byId.m3.detail).toBe("Opted out of reminders");
    expect(byId.m4.detail).toBe("Household flagged with a delivery problem");
    expect(byId.m5.detail).toBe("Household flagged with a delivery problem");
    expect(byId.m6.householdId).toBeNull();
    expect(byId.m6.householdName).toBe("Deleted household");
    expect(byId.m6.detail).not.toContain("provider_error");
    expect(byId.m6.detail).toBeTruthy();
  });

  it("counts messages per status", async () => {
    const { client } = db();
    const delivery = await loadDelivery(CAMPAIGN_C, client);
    expect(delivery?.counts).toEqual({
      delivered: 1,
      skipped: 2,
      bounced: 1,
      complained: 1,
      failed: 1,
    });
  });

  it("returns null for a campaign that does not exist", async () => {
    const { client } = db();
    expect(
      await loadDelivery("99999999-9999-4999-8999-999999999999", client),
    ).toBeNull();
  });
});

describe("option loaders", () => {
  it("loadMessageTypes returns key, label and whether it is essential", async () => {
    const { client } = db();
    expect(await loadMessageTypes(client)).toEqual([
      { key: "invitation", label: "Invitation", isEssential: true },
      { key: "rsvp_reminder", label: "RSVP reminder", isEssential: false },
    ]);
  });

  it("loadEventOptions returns slugs and names in display order", async () => {
    const { client } = db();
    expect(await loadEventOptions(client)).toEqual([
      { slug: "rehearsal", name: "Rehearsal" },
      { slug: "ceremony", name: "Ceremony" },
    ]);
  });

  it("loadHouseholdOptions returns ids and names sorted by name", async () => {
    const { client } = db();
    const options = await loadHouseholdOptions(client);
    expect(options[0]).toEqual({ id: "h2", name: "Exampleton family" });
    expect(options).toHaveLength(5);
  });
});
