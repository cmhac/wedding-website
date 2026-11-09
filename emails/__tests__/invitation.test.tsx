/** @jest-environment node */
import type { CampaignProps } from "../../src/lib/email/templates";
import invitation from "../invitation";

const props: CampaignProps = {
  household: { display_name: "The Fakes" },
  personal_link: "https://wedding.example/i/fake-id.fake-signature",
  rsvp_url: "https://wedding.example/rsvp",
  respond_by: "2027-03-01T08:00:00Z",
  events: [
    {
      slug: "ceremony",
      name: "Ceremony",
      starts_at: "2027-06-12T21:00:00Z",
      venue_name: "Fake Venue",
      is_required: true,
      status: "pending",
    },
    {
      slug: "brunch",
      name: "Farewell brunch",
      starts_at: null,
      venue_name: null,
      is_required: false,
      status: "pending",
    },
  ],
  pending: { required_events: 1, optional_events: 1, meals: 0 },
};

describe("invitation template", () => {
  it("renders a subject, HTML and plain text", async () => {
    const out = await invitation(props);
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.html).toContain("<html");
    expect(out.text).not.toContain("<");
  });

  it("carries the personal link in both bodies", async () => {
    const out = await invitation(props);
    expect(out.html).toContain("fake-id.fake-signature");
    expect(out.text).toContain("fake-id.fake-signature");
  });

  it("names the household, the events and the respond-by date", async () => {
    const out = await invitation(props);
    for (const body of [out.html, out.text]) {
      expect(body).toContain("The Fakes");
      expect(body).toContain("Ceremony");
      expect(body).toContain("Fake Venue");
      expect(body).toContain("Farewell brunch");
      expect(body).toContain("March 1, 2027");
    }
  });

  it("copes with an event that has no date or venue yet, and with no respond-by date", async () => {
    const out = await invitation({ ...props, respond_by: null });
    expect(out.text).toContain("Farewell brunch");
    expect(out.text).toMatch(/as soon as you can/);
  });

  it("reads nothing outside the contract", async () => {
    const withExtras = {
      ...props,
      address: "1 Secret Street",
      notes: "private note",
    } as CampaignProps;
    const out = await invitation(withExtras);
    expect(out.html + out.text).not.toContain("Secret Street");
    expect(out.html + out.text).not.toContain("private note");
  });

  it("is registered as invitation", async () => {
    const { getTemplate } = await import("@/lib/email/templates");
    expect(typeof getTemplate("invitation")).toBe("function");
  });
});
