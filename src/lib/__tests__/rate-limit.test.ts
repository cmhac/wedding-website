import { clientIp, createRateLimiter } from "../rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit then refuses within the window", () => {
    const now = 0;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => now,
    });
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(false);
  });

  it("tracks keys separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("b")).toBe(true);
  });

  it("allows again after the window passes", () => {
    let now = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => now,
    });
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(false);
    now = 1001;
    expect(limiter.check("a")).toBe(true);
  });
});

describe("clientIp", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("prefers x-real-ip, which the platform sets", () => {
    expect(
      clientIp(
        headers({
          "x-real-ip": "9.9.9.9",
          "x-forwarded-for": "1.1.1.1, 2.2.2.2",
        }),
      ),
    ).toBe("9.9.9.9");
  });

  it("uses the rightmost forwarded hop, never the leftmost one a caller can forge", () => {
    expect(
      clientIp(headers({ "x-forwarded-for": "6.6.6.6, 1.1.1.1, 2.2.2.2" })),
    ).toBe("2.2.2.2");
    expect(clientIp(headers({ "x-forwarded-for": "3.3.3.3" }))).toBe("3.3.3.3");
  });

  it("ignores blank hops and falls back to unknown", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.1.1.1, " }))).toBe(
      "1.1.1.1",
    );
    expect(clientIp(headers({}))).toBe("unknown");
    expect(clientIp(headers({ "x-real-ip": "  " }))).toBe("unknown");
  });
});
