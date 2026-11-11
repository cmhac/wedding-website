/** @jest-environment node */
import {
  ADMIN_PATH,
  FAILURE_PATH,
  allowedNext,
  guestPath,
  redirectTo,
} from "../redirect";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.GUEST_RSVP_PATH;
});

describe("guestPath", () => {
  it("defaults to the home page and follows GUEST_RSVP_PATH", () => {
    expect(guestPath()).toBe("/");
    process.env.GUEST_RSVP_PATH = "/reply";
    expect(guestPath()).toBe("/reply");
  });
});

describe("allowedNext", () => {
  it.each([
    ["/", "guest", "/"],
    ["/", "staff", "/"],
    ["/rsvp", "guest", null],
    ["/save-the-date", "guest", "/save-the-date"],
    ["/save-the-date", "staff", "/save-the-date"],
    ["/save-the-dates", "guest", null],
    ["/save-the-date/", "guest", null],
    ["/save-the-date/../admin", "guest", null],
    ["/admin", "guest", null],
    ["/admin/households", "staff", "/admin/households"],
    ["/rsvp", "staff", null],
    ["//evil.example", "guest", null],
    ["//evil.example", "staff", null],
    ["https://evil.example/", "guest", null],
    ["/rsvp//x", "guest", null],
    ["/?x=1", "guest", null],
    ["", "guest", null],
    [null, "guest", null],
  ] as const)("%s for a %s session gives %s", (next, kind, expected) => {
    expect(allowedNext(next, kind)).toBe(expected);
  });
});

describe("allowedNext with GUEST_RSVP_PATH set", () => {
  beforeEach(() => {
    process.env.GUEST_RSVP_PATH = "/rsvp";
  });

  it.each([
    ["/rsvp", "guest", "/rsvp"],
    ["/rsvp/meals", "guest", "/rsvp/meals"],
    ["/rsvp", "staff", "/rsvp"],
    ["/rsvpx", "guest", null],
    ["/rsvp?x=1", "guest", null],
    ["/", "guest", null],
  ] as const)("%s for a %s session gives %s", (next, kind, expected) => {
    expect(allowedNext(next, kind)).toBe(expected);
  });
});

describe("redirectTo", () => {
  it("is a 302 to the path on the site, never cached or indexed", () => {
    const res = redirectTo("/rsvp");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/rsvp");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("exposes the fixed paths", () => {
    expect(FAILURE_PATH).toBe("/auth/error");
    expect(ADMIN_PATH).toBe("/admin");
  });
});
