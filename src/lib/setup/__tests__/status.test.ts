import { evaluateSetup, type SetupInputs } from "../status";

const allSet: SetupInputs = {
  settings: {
    weddingEventId: "e1",
    weddingEventDate: "2027-06-12",
    rsvpOpen: false,
    defaultDeadline: "2027-04-01T00:00:00Z",
    place: "Seattle",
  },
  env: {
    siteUrl: "https://example.test",
    emailKey: true,
    emailFrom: true,
    linkKey: true,
    scheduleKey: true,
    webhookKey: true,
  },
  sms: { configured: true, enabled: true },
  confirmed: ["sending_domain"],
};

const open = (inputs: SetupInputs) =>
  evaluateSetup(inputs)
    .steps.filter((s) => s.status === "open")
    .map((s) => s.key);

const withEnv = (env: Partial<SetupInputs["env"]>): SetupInputs => ({
  ...allSet,
  env: { ...allSet.env, ...env },
});

describe("evaluateSetup", () => {
  it("marks everything done when everything is set", () => {
    const status = evaluateSetup(allSet);
    expect(open(allSet)).toEqual([]);
    expect(status).toMatchObject({
      requiredOpen: 0,
      requiredTotal: 5,
      recommendedOpen: 0,
    });
  });

  it("opens the site address when missing or not a web address", () => {
    expect(open(withEnv({ siteUrl: "" }))).toEqual(["site_url"]);
    const bad = evaluateSetup(withEnv({ siteUrl: "example.test" }));
    expect(bad.steps.find((s) => s.key === "site_url")).toMatchObject({
      status: "open",
      reason: expect.stringContaining("web address"),
    });
    expect(open(withEnv({ siteUrl: "http://localhost:3000" }))).toEqual([]);
  });

  it("needs both the email key and the from address", () => {
    expect(open(withEnv({ emailKey: false }))).toEqual(["email_sending"]);
    expect(open(withEnv({ emailFrom: false }))).toEqual(["email_sending"]);
  });

  it("opens the other hosting keys when missing", () => {
    expect(open(withEnv({ linkKey: false }))).toEqual(["link_key"]);
    expect(open(withEnv({ scheduleKey: false }))).toEqual(["schedule_key"]);
    expect(open(withEnv({ webhookKey: false }))).toEqual(["email_tracking"]);
  });

  it("needs a wedding event that has a date", () => {
    const none = { ...allSet.settings, weddingEventId: null };
    expect(open({ ...allSet, settings: none })).toEqual(["wedding_event"]);
    const noDate = { ...allSet.settings, weddingEventDate: null };
    const result = evaluateSetup({ ...allSet, settings: noDate });
    expect(result.steps.find((s) => s.key === "wedding_event")).toMatchObject({
      status: "open",
      reason: expect.stringContaining("date"),
    });
  });

  it("treats the recommended console steps from the settings row", () => {
    const s = { ...allSet.settings, place: null };
    expect(open({ ...allSet, settings: s })).toEqual(["card_details"]);
    const d = { ...allSet.settings, defaultDeadline: null };
    expect(open({ ...allSet, settings: d })).toEqual(["rsvp_deadline"]);
    const r = { ...allSet.settings, rsvpOpen: true };
    expect(open({ ...allSet, settings: r })).toEqual(["rsvp_closed"]);
  });

  it("opens texting when not configured or switched off, with a reason", () => {
    const notConfigured = evaluateSetup({
      ...allSet,
      sms: { configured: false, enabled: false },
    });
    expect(notConfigured.steps.find((s) => s.key === "texting")).toMatchObject({
      status: "open",
      reason: expect.stringContaining("not set"),
    });
    const off = evaluateSetup({
      ...allSet,
      sms: { configured: true, enabled: false },
    });
    expect(off.steps.find((s) => s.key === "texting")).toMatchObject({
      status: "open",
      reason: expect.stringContaining("switched on"),
    });
  });

  it("marks a manual step done only when confirmed", () => {
    expect(open({ ...allSet, confirmed: [] })).toEqual(["sending_domain"]);
  });

  it("counts required and recommended steps still open", () => {
    const status = evaluateSetup({
      ...allSet,
      env: {
        ...allSet.env,
        emailKey: false,
        linkKey: false,
        webhookKey: false,
      },
      confirmed: [],
    });
    expect(status).toMatchObject({
      requiredOpen: 2,
      requiredTotal: 5,
      recommendedOpen: 2,
    });
  });

  it("never carries a secret value (it only receives presence)", () => {
    expect(JSON.stringify(evaluateSetup(allSet))).not.toMatch(/secret|sk_/i);
  });
});
