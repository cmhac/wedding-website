/** @jest-environment node */
import type { CampaignProps } from "../../src/lib/email/templates";
import rsvpReminder from "../rsvp-reminder";

const props: CampaignProps = {
  household: { display_name: "The Fakes" },
  personal_link: "https://wedding.example/i/fake-id.fake-signature",
  rsvp_url: "https://wedding.example/rsvp",
  respond_by: "2027-03-01T08:00:00Z",
  events: [],
  pending: { required_events: 2, optional_events: 1, meals: 3 },
};

describe("rsvp_reminder template", () => {
  it("renders a subject, HTML and plain text with the personal link in both", async () => {
    const out = await rsvpReminder(props);
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.html).toContain("fake-id.fake-signature");
    expect(out.text).toContain("fake-id.fake-signature");
    expect(out.text).not.toContain("<");
  });

  it("includes the respond-by date and what is still pending", async () => {
    const out = await rsvpReminder(props);
    for (const body of [out.html, out.text]) {
      expect(body).toContain("March 1, 2027");
      expect(body).toMatch(/2 events still need an answer/);
      expect(body).toMatch(/1 optional event still needs an answer/);
      expect(body).toMatch(/3 meal choices are still to pick/);
    }
  });

  it("says nothing about what is not pending, and omits a missing date", async () => {
    const out = await rsvpReminder({
      ...props,
      respond_by: null,
      pending: { required_events: 0, optional_events: 0, meals: 1 },
    });
    expect(out.text).toMatch(/1 meal choice is still to pick/);
    expect(out.text).not.toMatch(/optional/);
    expect(out.text).not.toMatch(/Please respond by/);
  });

  it("reads nothing outside the contract", async () => {
    const out = await rsvpReminder({
      ...props,
      address: "1 Secret Street",
    } as CampaignProps);
    expect(out.html + out.text).not.toContain("Secret Street");
  });

  it("is registered as rsvp_reminder", async () => {
    const { getTemplate } = await import("@/lib/email/templates");
    expect(typeof getTemplate("rsvp_reminder")).toBe("function");
  });
});
