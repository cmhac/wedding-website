import { render, screen, within } from "@testing-library/react";
import { PrivacyPolicy } from "../PrivacyPolicy";
import { TermsAndConditions } from "../TermsAndConditions";
import { SUPPORT_EMAIL, SITE_NAME } from "@/lib/site/legal";

// The privacy and terms pages are public, fixed text for everyone. They carry
// the wording the text-message carrier registration requires.

function text() {
  return screen.getByRole("main").textContent ?? "";
}

describe("PrivacyPolicy", () => {
  beforeEach(() => render(<PrivacyPolicy />));

  it("is titled Privacy Policy and names the wedding site and the couple", () => {
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeInTheDocument();
    expect(text()).toContain(SITE_NAME);
    expect(text()).toContain("hannahandchris.wedding");
    expect(text()).toContain("Christopher Hacker");
    expect(text()).toContain("Hannah Seabury");
  });

  it("says what is collected, including whether a guest opted in to texts", () => {
    expect(text()).toMatch(/email addresses and mobile phone numbers/);
    expect(text()).toMatch(/whether you chose to receive text messages/);
    expect(text()).toMatch(/RSVP answers, meal choices and dietary needs/);
  });

  it("says texts go only to numbers that opted in", () => {
    expect(text()).not.toMatch(/invitation/);
    expect(text()).toMatch(/only after you opt in by ticking a box/);
  });

  it("states that SMS opt-in data is not sold or shared for marketing, in bold", () => {
    const statement =
      "We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.";
    expect(screen.getByText(statement).tagName).toBe("STRONG");
  });

  it("says how long data is kept and how to ask for correction or deletion", () => {
    expect(text()).toMatch(/Within 30 days after the wedding/);
    expect(text()).toMatch(/correct or delete your information/);
    expect(
      screen.getAllByRole("link", { name: SUPPORT_EMAIL })[0],
    ).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
  });

  it("links to the terms page", () => {
    const links = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/terms");
    expect(links.length).toBeGreaterThan(0);
  });
});

describe("TermsAndConditions", () => {
  beforeEach(() => render(<TermsAndConditions />));

  it("is titled Terms & Conditions and names the wedding site and the couple", () => {
    expect(
      screen.getByRole("heading", { level: 1, name: "Terms & Conditions" }),
    ).toBeInTheDocument();
    expect(text()).toContain("hannahandchris.wedding");
    expect(text()).toContain("Christopher Hacker");
    expect(text()).toContain("Hannah Seabury");
  });

  it("has an SMS section with the program, frequency, cost, help, stop and consent terms", () => {
    expect(
      screen.getByRole("heading", { name: /SMS terms/ }),
    ).toBeInTheDocument();
    expect(text()).not.toMatch(/RSVP reminders|logistics updates|invitation/);
    expect(text()).toMatch(/About a dozen messages per number/);
    expect(text()).toMatch(/Message and data rates may apply/);
    expect(text()).toMatch(/Agreeing is optional/);
  });

  it("shows STOP and HELP in bold", () => {
    const strong = Array.from(
      screen.getByRole("main").querySelectorAll("strong"),
    ).map((el) => el.textContent);
    expect(strong).toEqual(expect.arrayContaining(["STOP", "HELP"]));
  });

  it("says carriers are not liable for delayed or undelivered messages", () => {
    expect(text()).toMatch(
      /carriers are not liable for delayed or undelivered messages/i,
    );
  });

  it("gives support contact details and links to the privacy page", () => {
    expect(
      screen.getAllByRole("link", { name: SUPPORT_EMAIL })[0],
    ).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    const privacy = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/privacy");
    expect(privacy.length).toBeGreaterThan(0);
  });
});

describe("both pages", () => {
  it.each([
    ["privacy", PrivacyPolicy],
    ["terms", TermsAndConditions],
  ])(
    "%s page has a footer linking to both pages and no guest data",
    (_n, C) => {
      const { container } = render(<C />);
      const footer = within(screen.getByRole("contentinfo"));
      expect(
        footer.getByRole("link", { name: "Privacy Policy" }),
      ).toHaveAttribute("href", "/privacy");
      expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute(
        "href",
        "/terms",
      );
      // Fixed copy only: no forms, inputs or personalised content.
      expect(container.querySelector("input, form, button")).toBeNull();
    },
  );
});
