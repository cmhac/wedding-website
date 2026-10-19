import {
  buildCampaignProps,
  getTemplate,
  renderTemplate,
  TemplateError,
  type TemplateRegistry,
} from "../templates";
import { fixtureRegistry, received } from "./fixtures/templates";

const registry = fixtureRegistry as unknown as TemplateRegistry;

describe("templates", () => {
  it("renders a registered key to subject, html and text", async () => {
    const out = await renderTemplate(
      "magic_link",
      { sign_in_url: "https://example.com/x", audience: "guest" },
      registry,
    );
    expect(Object.keys(out).sort()).toEqual(["html", "subject", "text"]);
  });

  it("throws template_missing for an unregistered key", () => {
    expect(() => getTemplate("nope", registry)).toThrow(
      expect.objectContaining({ code: "template_missing" }),
    );
    expect(() => getTemplate("toString", registry)).toThrow(TemplateError);
  });

  it("treats the shipped registry as empty", () => {
    expect(() => getTemplate("magic_link")).toThrow(
      expect.objectContaining({ code: "template_missing" }),
    );
  });

  it("surfaces a throwing template as template_failed without its message", async () => {
    const err = await renderTemplate("broken", {}, registry).catch((e) => e);
    expect(err).toBeInstanceOf(TemplateError);
    expect(err.code).toBe("template_failed");
    expect(err.message).not.toContain("example.com");
  });

  it("passes campaign templates exactly the contract fields", async () => {
    const props = buildCampaignProps({
      household: {
        display_name: "Test Household",
        contact_email: "test@example.com",
        address: { street: "1 Fake St" },
        notes: "private note",
      } as { display_name: string },
      respond_by: "2026-12-01T00:00:00Z",
      pending: { required_events: 1, optional_events: 0, meals: 2 },
      siteUrl: "https://site.example/",
      events: [
        {
          slug: "ceremony",
          name: "Ceremony",
          starts_at: "2026-12-12T15:00:00Z",
          venue_name: "Venue",
          is_required: true,
          status: "pending",
          dietary_notes: "no nuts",
          guest_email: "g@example.com",
        },
      ],
    });
    await renderTemplate("invitation", props, registry);
    const seen = received.campaign.at(-1)!;
    expect(Object.keys(seen).sort()).toEqual([
      "events",
      "household",
      "pending",
      "respond_by",
      "rsvp_url",
    ]);
    expect(Object.keys(seen.household)).toEqual(["display_name"]);
    expect(Object.keys(seen.events[0]).sort()).toEqual([
      "is_required",
      "name",
      "slug",
      "starts_at",
      "status",
      "venue_name",
    ]);
    expect(Object.keys(seen.pending).sort()).toEqual([
      "meals",
      "optional_events",
      "required_events",
    ]);
    expect(seen.rsvp_url).toBe("https://site.example/rsvp");
    const json = JSON.stringify(seen);
    for (const leak of [
      "example.com/",
      "1 Fake St",
      "private note",
      "no nuts",
    ]) {
      expect(json).not.toContain(leak);
    }
    expect(json).not.toContain("test@example.com");
  });

  it("uses a custom RSVP path", () => {
    const props = buildCampaignProps({
      household: { display_name: "H" },
      respond_by: null,
      pending: { required_events: 0, optional_events: 0, meals: 0 },
      siteUrl: "https://site.example",
      rsvpPath: "/r",
      events: [],
    });
    expect(props.rsvp_url).toBe("https://site.example/r");
  });
});
