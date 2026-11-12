import {
  bannerMode,
  resumeKey,
  type BannerMode,
  type GuideState,
} from "./banner";
import { evaluateSetup, type SetupInputs, type SetupStatus } from "./status";
import { REQUIRED_KEYS, STEPS, type StepDef } from "./steps";

/**
 * The plain, serializable picture of the guide that the console layout hands
 * to the client component: the catalogue text, each step's live status, who may
 * change it, and the person's own state. It holds no secret value.
 */
export type SetupStepView = Omit<StepDef, "coupleOnly"> & {
  status: "done" | "open";
  reason?: string;
  skipped: boolean;
  /** False when this person's role may not change the step (it shows read-only). */
  canChange: boolean;
};

export type SetupView = {
  mode: BannerMode;
  steps: SetupStepView[];
  requiredOpen: number;
  requiredTotal: number;
  recommendedOpen: number;
  requiredKeys: string[];
  resumeKey: string | null;
  skippedCount: number;
  /** For the wedding event step's choice. */
  events: { id: string; name: string; date: string | null }[];
  /** Current values for the console steps' forms. */
  values: {
    eventId: string;
    place: string;
    note: string;
    deadline: string;
    rsvpOpen: boolean;
    smsConfigured: boolean;
    smsEnabled: boolean;
  };
};

export type ViewExtras = {
  events: SetupView["events"];
  note: string;
  deadlineLocal: string;
};

export function buildSetupView(
  inputs: SetupInputs,
  state: GuideState | null,
  role: "couple" | "planner",
  extras: ViewExtras,
): SetupView {
  const status: SetupStatus = evaluateSetup(inputs);
  const skipped = new Set(state?.skipped_steps ?? []);
  const steps: SetupStepView[] = STEPS.map((def) => {
    const live = status.steps.find((s) => s.key === def.key)!;
    const { coupleOnly, ...rest } = def;
    return {
      ...rest,
      status: live.status,
      reason: live.reason,
      skipped: live.status === "open" && skipped.has(def.key),
      canChange: !coupleOnly || role === "couple",
    };
  });
  return {
    mode: bannerMode(status, state),
    steps,
    requiredOpen: status.requiredOpen,
    requiredTotal: status.requiredTotal,
    recommendedOpen: status.recommendedOpen,
    requiredKeys: [...REQUIRED_KEYS],
    resumeKey: resumeKey(status, state),
    skippedCount: steps.filter((s) => s.skipped).length,
    events: extras.events,
    values: {
      eventId: inputs.settings.weddingEventId ?? "",
      place: inputs.settings.place ?? "",
      note: extras.note,
      deadline: extras.deadlineLocal,
      rsvpOpen: inputs.settings.rsvpOpen,
      smsConfigured: inputs.sms.configured,
      smsEnabled: inputs.sms.enabled,
    },
  };
}
