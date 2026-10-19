import { loadCampaignProps } from "../props";
import { createFakeDb } from "./fixtures/fake-db";

const HOUSEHOLD = "h-1";
const NOW = new Date("2026-10-19T12:00:00Z");

function seed(overrides: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeDb({
    households: [
      {
        id: HOUSEHOLD,
        display_name: "Test Household",
        contact_email: "test@example.com",
        address: { line1: "1 Test Street" },
        notes: "private note",
        rsvp_deadline_override: null,
      },
    ],
    guests: [
      {
        id: "g-1",
        household_id: HOUSEHOLD,
        dietary_notes: "private diet",
        notes: "private",
      },
      { id: "g-2", household_id: HOUSEHOLD },
      { id: "g-other", household_id: "h-2" },
    ],
    events: [
      {
        id: "e-1",
        slug: "ceremony",
        name: "Ceremony",
        starts_at: "2027-06-12T14:00:00Z",
        venue_name: "Test Venue",
        is_required: true,
        rsvp_deadline: "2027-03-01T00:00:00Z",
        display_order: 1,
      },
      {
        id: "e-2",
        slug: "welcome-party",
        name: "Welcome party",
        starts_at: "2027-06-11T18:00:00Z",
        venue_name: "Other Venue",
        is_required: false,
        rsvp_deadline: "2027-02-01T00:00:00Z",
        display_order: 0,
      },
      {
        id: "e-3",
        slug: "rehearsal",
        name: "Rehearsal",
        starts_at: "2027-06-10T18:00:00Z",
        venue_name: "Third Venue",
        is_required: false,
        rsvp_deadline: null,
        display_order: 2,
      },
    ],
    invitations: [
      { guest_id: "g-1", event_id: "e-1", status: "attending" },
      { guest_id: "g-2", event_id: "e-1", status: "pending" },
      { guest_id: "g-1", event_id: "e-2", status: "declined" },
      { guest_id: "g-2", event_id: "e-2", status: "declined" },
      { guest_id: "g-other", event_id: "e-3", status: "pending" },
    ],
    household_rsvp_progress: [
      {
        household_id: HOUSEHOLD,
        pending_required_events: 1,
        pending_optional_events: 0,
        pending_meals: 2,
      },
    ],
    settings: [{ id: true, default_rsvp_deadline: "2027-05-01T00:00:00Z" }],
    ...overrides,
  });
}

const options = {
  siteUrl: "https://example.test",
  rsvpPath: "/rsvp",
  now: NOW,
};

describe("loadCampaignProps", () => {
  it("builds the display name and RSVP link", async () => {
    const props = await loadCampaignProps(seed(), HOUSEHOLD, options);
    expect(props?.household).toEqual({ display_name: "Test Household" });
    expect(props?.rsvp_url).toBe("https://example.test/rsvp");
  });

  it("lists only events the household's guests are invited to, in date order", async () => {
    const props = await loadCampaignProps(seed(), HOUSEHOLD, options);
    expect(props?.events.map((e) => e.slug)).toEqual([
      "welcome-party",
      "ceremony",
    ]);
    expect(props?.events[1]).toEqual({
      slug: "ceremony",
      name: "Ceremony",
      starts_at: "2027-06-12T14:00:00Z",
      venue_name: "Test Venue",
      is_required: true,
      status: "pending",
    });
  });

  it("gives an event an overall status across the household", async () => {
    const props = await loadCampaignProps(seed(), HOUSEHOLD, options);
    const status = Object.fromEntries(
      props!.events.map((e) => [e.slug, e.status]),
    );
    // One guest attending and one pending: still pending.
    expect(status.ceremony).toBe("pending");
    // Everyone declined.
    expect(status["welcome-party"]).toBe("declined");
  });

  it("reports attending when nobody is pending and someone attends", async () => {
    const db = seed({
      invitations: [
        { guest_id: "g-1", event_id: "e-1", status: "attending" },
        { guest_id: "g-2", event_id: "e-1", status: "declined" },
      ],
    });
    const props = await loadCampaignProps(db, HOUSEHOLD, options);
    expect(props?.events[0].status).toBe("attending");
  });

  it("uses the earliest open deadline among unanswered events", async () => {
    const props = await loadCampaignProps(seed(), HOUSEHOLD, options);
    // Only the ceremony is unanswered; its own deadline applies.
    expect(props?.respond_by).toBe("2027-03-01T00:00:00.000Z");
  });

  it("prefers the household override, then the site default", async () => {
    const withOverride = seed();
    withOverride.tables.households[0].rsvp_deadline_override =
      "2027-01-15T00:00:00Z";
    expect(
      (await loadCampaignProps(withOverride, HOUSEHOLD, options))?.respond_by,
    ).toBe("2027-01-15T00:00:00.000Z");

    const defaulted = seed();
    defaulted.tables.events[0].rsvp_deadline = null;
    expect(
      (await loadCampaignProps(defaulted, HOUSEHOLD, options))?.respond_by,
    ).toBe("2027-05-01T00:00:00.000Z");
  });

  it("ignores deadlines that have passed, and gives null when none is open", async () => {
    const db = seed();
    db.tables.events[0].rsvp_deadline = "2026-01-01T00:00:00Z";
    db.tables.settings[0].default_rsvp_deadline = null;
    expect(
      (await loadCampaignProps(db, HOUSEHOLD, options))?.respond_by,
    ).toBeNull();
  });

  it("copies the pending counts from the progress view", async () => {
    const props = await loadCampaignProps(seed(), HOUSEHOLD, options);
    expect(props?.pending).toEqual({
      required_events: 1,
      optional_events: 0,
      meals: 2,
    });
  });

  it("uses zero counts when the progress view has no row", async () => {
    const db = seed({ household_rsvp_progress: [] });
    const props = await loadCampaignProps(db, HOUSEHOLD, options);
    expect(props?.pending).toEqual({
      required_events: 0,
      optional_events: 0,
      meals: 0,
    });
  });

  it("passes a missing start time or venue through as null", async () => {
    const db = seed();
    db.tables.events[0].starts_at = null;
    db.tables.events[0].venue_name = null;
    const props = await loadCampaignProps(db, HOUSEHOLD, options);
    const ceremony = props!.events.find((e) => e.slug === "ceremony")!;
    expect(ceremony.starts_at).toBeNull();
    expect(ceremony.venue_name).toBeNull();
  });

  it("returns null for an unknown household", async () => {
    expect(await loadCampaignProps(seed(), "missing", options)).toBeNull();
  });

  it("contains no email, postal address, dietary data or notes", async () => {
    const props = await loadCampaignProps(seed(), HOUSEHOLD, options);
    const text = JSON.stringify(props);
    for (const secret of [
      "test@example.com",
      "1 Test Street",
      "private",
      "dietary",
      "notes",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(Object.keys(props!).sort()).toEqual([
      "events",
      "household",
      "pending",
      "respond_by",
      "rsvp_url",
    ]);
  });
});
