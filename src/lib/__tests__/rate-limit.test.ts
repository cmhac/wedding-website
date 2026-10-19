import { createRateLimiter } from "../rate-limit";

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
