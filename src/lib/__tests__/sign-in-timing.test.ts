import { withMinimumDuration } from "../sign-in-timing";

describe("withMinimumDuration", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("does not settle before the minimum time, even when the work is instant", async () => {
    const work = jest.fn(async () => "done");
    let settled = false;
    const p = withMinimumDuration(1000, work).then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(999);
    expect(work).toHaveBeenCalled();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe(true);
  });

  it("waits for slow work rather than cutting it short", async () => {
    let settled = false;
    const p = withMinimumDuration(
      100,
      () => new Promise<void>((r) => setTimeout(r, 500)),
    ).then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(400);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(100);
    await p;
    expect(settled).toBe(true);
  });

  it("still pads the time when the work throws, and swallows the error", async () => {
    let settled = false;
    const p = withMinimumDuration(1000, async () => {
      throw new Error("boom");
    }).then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe(true);
  });
});
