/** @jest-environment node */
import { CookieJar, extractSignInLink, summarise } from "../guest-api-smoke";

describe("extractSignInLink", () => {
  it("finds the first http link in the mail text", () => {
    const text =
      "Hello\nOpen http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink now";
    expect(extractSignInLink(text)).toBe(
      "http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink",
    );
  });

  it("decodes html-escaped ampersands and returns null when absent", () => {
    expect(extractSignInLink("see http://x.test/a?b=1&amp;c=2 ok")).toBe(
      "http://x.test/a?b=1&c=2",
    );
    expect(extractSignInLink("no link here")).toBeNull();
  });
});

describe("CookieJar", () => {
  it("keeps name=value pairs, overwrites repeats, and drops attributes", () => {
    const jar = new CookieJar();
    jar.store(["sb-a=1; Path=/; HttpOnly", "sb-b=2; Path=/"]);
    jar.store(["sb-a=3; Path=/"]);
    expect(jar.header()).toBe("sb-a=3; sb-b=2");
  });

  it("removes a cookie set to an empty value", () => {
    const jar = new CookieJar();
    jar.store(["sb-a=1"]);
    jar.store(["sb-a=; Max-Age=0"]);
    expect(jar.header()).toBe("");
  });
});

describe("summarise", () => {
  it("prints step outcomes only", () => {
    const out = summarise([
      { step: "sign-in neutral", pass: true, detail: "202" },
      { step: "deadline", pass: false, detail: "got 200" },
    ]);
    expect(out).toContain("PASS sign-in neutral (202)");
    expect(out).toContain("FAIL deadline (got 200)");
  });
});
