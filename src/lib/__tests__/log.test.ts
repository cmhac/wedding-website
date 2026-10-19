import { log } from "../log";

describe("log", () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const written = () => spy.mock.calls.map((c) => String(c[0])).join("\n");

  it("writes the event and allowed fields as JSON", () => {
    log.info("rsvp_saved", { householdId: "h1", count: 3, code: "ok" });
    const parsed = JSON.parse(written());
    expect(parsed).toMatchObject({
      level: "info",
      event: "rsvp_saved",
      householdId: "h1",
      count: 3,
      code: "ok",
    });
  });

  it.each(["email", "name", "address", "dietary", "token", "body"])(
    "drops a key named %s",
    (key) => {
      log.info("x", { [key]: "FAKE-PERSONAL-VALUE", id: "k1" });
      const out = written();
      expect(out).not.toContain("FAKE-PERSONAL-VALUE");
      expect(out).toContain("k1");
    },
  );

  it("drops forbidden keys regardless of case", () => {
    log.info("x", { Email: "FAKE-PERSONAL-VALUE" });
    expect(written()).not.toContain("FAKE-PERSONAL-VALUE");
  });

  it("drops forbidden keys that appear in compound names", () => {
    log.info("x", { guestEmail: "FAKE-PERSONAL-VALUE", contact_name: "FAKE2" });
    expect(written()).not.toMatch(/FAKE/);
  });

  it("drops non-primitive values", () => {
    log.info("x", { id: { nested: "FAKE-PERSONAL-VALUE" } as never });
    expect(written()).not.toContain("FAKE-PERSONAL-VALUE");
  });

  it("drops string values that look like email addresses", () => {
    log.info("x", { id: "someone@example.com" });
    expect(written()).not.toContain("someone@example.com");
  });

  it("routes errors to console.error and warnings to console.warn", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    log.error("boom", { code: "x" });
    log.warn("hmm", { code: "y" });
    expect(err).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
