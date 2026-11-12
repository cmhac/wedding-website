import { siteUrl } from "../url";

describe("siteUrl", () => {
  it("uses the configured site address", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.test" })).toBe(
      "https://example.test",
    );
  });

  it("drops a trailing slash so paths can be added safely", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.test/" })).toBe(
      "https://example.test",
    );
  });

  it("prefers the configured address even on a preview", () => {
    expect(
      siteUrl({
        NEXT_PUBLIC_SITE_URL: "https://example.test",
        VERCEL_ENV: "preview",
        VERCEL_URL: "app-abc.vercel.app",
      }),
    ).toBe("https://example.test");
  });

  it("uses the preview deployment's own address when none is configured", () => {
    expect(
      siteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "app-abc.vercel.app" }),
    ).toBe("https://app-abc.vercel.app");
  });

  it("does not guess an address outside a preview", () => {
    expect(
      siteUrl({ VERCEL_ENV: "production", VERCEL_URL: "app-abc.vercel.app" }),
    ).toBe("");
    expect(siteUrl({})).toBe("");
  });
});
