import { bannerMode, resumeKey, type GuideState } from "../banner";
import type { SetupStatus } from "../status";

const status = (open: string[], recommended: string[] = []): SetupStatus => {
  const keys = [
    "site_url",
    "wedding_event",
    "email_sending",
    "link_key",
    "schedule_key",
  ];
  return {
    steps: [
      ...keys.map((key) => ({
        key,
        status: open.includes(key) ? ("open" as const) : ("done" as const),
      })),
      ...recommended.map((key) => ({ key, status: "open" as const })),
    ],
    requiredOpen: open.length,
    requiredTotal: 5,
    recommendedOpen: recommended.length,
  };
};

const state = (over: Partial<GuideState> = {}): GuideState => ({
  skipped_steps: [],
  last_step: null,
  left_guide: false,
  seen_required: [],
  ...over,
});

describe("bannerMode", () => {
  it("is hidden when no required step is open, even after leaving", () => {
    expect(bannerMode(status([]), state())).toBe("hidden");
    expect(bannerMode(status([]), state({ left_guide: true }))).toBe("hidden");
  });

  it("is hidden when only recommended steps are open", () => {
    expect(bannerMode(status([], ["texting"]), state())).toBe("hidden");
  });

  it("is full until the person leaves the guide", () => {
    expect(bannerMode(status(["link_key"]), state())).toBe("full");
  });

  it("is compact after leaving while the open steps were already known", () => {
    const s = state({
      left_guide: true,
      seen_required: ["link_key", "site_url"],
    });
    expect(bannerMode(status(["link_key"]), s)).toBe("compact");
  });

  it("returns to full when a required step the person has not seen is open", () => {
    const s = state({ left_guide: true, seen_required: ["site_url"] });
    expect(bannerMode(status(["site_url", "link_key"]), s)).toBe("full");
  });

  it("counts a skipped step as still open", () => {
    const s = state({ skipped_steps: ["link_key"] });
    expect(bannerMode(status(["link_key"]), s)).toBe("full");
  });

  it("treats no stored state as a person who has not left", () => {
    expect(bannerMode(status(["link_key"]), null)).toBe("full");
  });
});

describe("resumeKey", () => {
  it("returns the last step viewed while it is still open", () => {
    const s = state({ last_step: "link_key" });
    expect(resumeKey(status(["site_url", "link_key"]), s)).toBe("link_key");
  });

  it("falls back to the first open required step when the last one is done", () => {
    const s = state({ last_step: "wedding_event" });
    expect(resumeKey(status(["site_url", "link_key"]), s)).toBe("site_url");
  });

  it("falls back to the first open recommended step when required are done", () => {
    expect(resumeKey(status([], ["texting"]), null)).toBe("texting");
  });

  it("is null when everything is done", () => {
    expect(resumeKey(status([]), null)).toBeNull();
  });
});
