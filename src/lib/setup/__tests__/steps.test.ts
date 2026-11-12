import { STEPS, stepByKey, REQUIRED_KEYS } from "../steps";

describe("the step catalogue", () => {
  it("lists the steps in the documented order", () => {
    expect(STEPS.map((s) => s.key)).toEqual([
      "site_url",
      "wedding_event",
      "email_sending",
      "link_key",
      "schedule_key",
      "card_details",
      "rsvp_deadline",
      "rsvp_closed",
      "texting",
      "email_tracking",
      "sending_domain",
    ]);
  });

  it("has exactly five required steps", () => {
    expect(
      STEPS.filter((s) => s.group === "required").map((s) => s.key),
    ).toEqual([
      "site_url",
      "wedding_event",
      "email_sending",
      "link_key",
      "schedule_key",
    ]);
    expect(REQUIRED_KEYS).toHaveLength(5);
  });

  it("gives every step a plain purpose, an if-unset line and a kind", () => {
    for (const step of STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.purpose.length).toBeGreaterThan(10);
      expect(step.ifUnset.length).toBeGreaterThan(5);
      expect(["console", "outside", "manual"]).toContain(step.kind);
    }
  });

  it("uses keys the database accepts", () => {
    for (const step of STEPS) expect(step.key).toMatch(/^[a-z0-9_]{1,40}$/);
  });

  it("names the hosting values for every step set outside the console", () => {
    for (const step of STEPS.filter((s) => s.kind === "outside")) {
      expect(step.envNames?.length).toBeGreaterThan(0);
    }
  });

  it("makes only the texting switch couple-only", () => {
    expect(STEPS.filter((s) => s.coupleOnly).map((s) => s.key)).toEqual([
      "texting",
    ]);
  });

  it("points each step set on a console page at the page where it is set up", () => {
    const pages = Object.fromEntries(
      STEPS.filter((s) => s.page).map((s) => [s.key, s.page]),
    );
    expect(pages).toEqual({
      wedding_event: { href: "/admin/events", name: "Events" },
      card_details: {
        href: "/admin/settings#save-the-date-place",
        name: "Settings",
      },
      rsvp_deadline: {
        href: "/admin/settings#default-rsvp-deadline",
        name: "Settings",
      },
      rsvp_closed: { href: "/admin/settings#rsvp-open", name: "Settings" },
    });
  });

  it("finds a step by key and refuses an unknown one", () => {
    expect(stepByKey("site_url")?.label).toBe("Site address");
    expect(stepByKey("nope")).toBeUndefined();
  });
});
