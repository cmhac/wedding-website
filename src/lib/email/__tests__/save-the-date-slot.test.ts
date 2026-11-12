/** @jest-environment node */
import {
  getTemplate,
  renderTemplate,
  type SaveTheDateProps,
} from "../templates";

const props: SaveTheDateProps = {
  household: { display_name: "Test Household" },
  personal_link: "https://example.test/i/abc.def?next=/save-the-date",
  rsvp_url: "https://example.test/rsvp",
  respond_by: null,
  events: [],
  pending: { required_events: 0, optional_events: 0, meals: 0 },
  site_url: "https://example.test",
  details: {
    couple_names: "Chris & Hannah",
    date: "2027-09-18",
    place: "Napa Valley, California",
    note: "Invitation to follow",
    revision: 1,
    calendar: null,
  },
};

describe("the save the date email slot", () => {
  it("is empty in the real registry: the wording and design are supplied by the couple or the designer", () => {
    expect(() => getTemplate("save_the_date")).toThrow(
      expect.objectContaining({ code: "template_missing" }),
    );
  });

  it("renders whatever template is registered, with the household, the link, the card's facts and the site address", async () => {
    const received: SaveTheDateProps[] = [];
    const registry = {
      save_the_date: (p: SaveTheDateProps) => {
        received.push(p);
        return { subject: "fixture", html: "<p>fixture</p>", text: "fixture" };
      },
    };
    const rendered = await renderTemplate(
      "save_the_date",
      props,
      registry as never,
    );
    expect(rendered.subject).toBe("fixture");
    expect(received[0].household.display_name).toBe("Test Household");
    expect(received[0].personal_link).toContain("?next=/save-the-date");
    expect(received[0].details.date).toBe("2027-09-18");
    expect(received[0].site_url).toBe("https://example.test");
  });
});
