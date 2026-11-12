import { buildSetupView } from "../view";
import type { SetupInputs } from "../status";

const inputs: SetupInputs = {
  settings: {
    weddingEventId: null,
    weddingEventDate: null,
    rsvpOpen: true,
    defaultDeadline: null,
    place: null,
  },
  env: {
    siteUrl: "https://example.test",
    emailKey: false,
    emailFrom: false,
    linkKey: true,
    scheduleKey: true,
    webhookKey: false,
  },
  sms: { configured: true, enabled: false },
  confirmed: [],
};
const extras = { events: [], note: "", deadlineLocal: "" };

describe("buildSetupView", () => {
  it("combines status, the person's state and their role", () => {
    const view = buildSetupView(
      inputs,
      {
        skipped_steps: ["wedding_event", "link_key"],
        last_step: "email_sending",
        left_guide: false,
        seen_required: [],
      },
      "planner",
      extras,
    );
    expect(view.mode).toBe("full");
    expect(view.requiredOpen).toBe(2);
    expect(view.resumeKey).toBe("email_sending");
    // A skipped step that is done is not shown as skipped; one still open is.
    expect(view.steps.find((s) => s.key === "link_key")?.skipped).toBe(false);
    expect(view.steps.find((s) => s.key === "wedding_event")?.skipped).toBe(
      true,
    );
    expect(view.skippedCount).toBe(1);
  });

  it("makes the texting step read-only for a planner only", () => {
    const planner = buildSetupView(inputs, null, "planner", extras);
    const couple = buildSetupView(inputs, null, "couple", extras);
    expect(planner.steps.find((s) => s.key === "texting")?.canChange).toBe(
      false,
    );
    expect(couple.steps.find((s) => s.key === "texting")?.canChange).toBe(true);
    expect(planner.steps.find((s) => s.key === "site_url")?.canChange).toBe(
      true,
    );
  });
});
