import { REQUIRED_KEYS } from "./steps";
import type { SetupStatus } from "./status";

/** One staff member's guide state: interface only, never what is done. */
export type GuideState = {
  skipped_steps: string[];
  last_step: string | null;
  left_guide: boolean;
  seen_required: string[];
};

export type BannerMode = "hidden" | "compact" | "full";

/**
 * hidden: no required step is open. compact: the person left the guide and
 * every open required step was already known when they left. full: otherwise,
 * which includes a required step added since they left. A skipped step still
 * counts as open.
 */
export function bannerMode(
  status: SetupStatus,
  state: GuideState | null,
): BannerMode {
  const openRequired = status.steps.filter(
    (s) => s.status === "open" && REQUIRED_KEYS.includes(s.key),
  );
  if (openRequired.length === 0) return "hidden";
  if (!state?.left_guide) return "full";
  const seen = new Set(state.seen_required);
  return openRequired.every((s) => seen.has(s.key)) ? "compact" : "full";
}

/** Where "Resume setup" opens: the last step viewed if still open, else the first open one. */
export function resumeKey(
  status: SetupStatus,
  state: GuideState | null,
): string | null {
  const isOpen = (key: string) =>
    status.steps.some((s) => s.key === key && s.status === "open");
  if (state?.last_step && isOpen(state.last_step)) return state.last_step;
  const firstRequired = status.steps.find(
    (s) => s.status === "open" && REQUIRED_KEYS.includes(s.key),
  );
  if (firstRequired) return firstRequired.key;
  return status.steps.find((s) => s.status === "open")?.key ?? null;
}
