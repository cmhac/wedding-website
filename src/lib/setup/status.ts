import { STEPS } from "./steps";

/**
 * Turns the live state of the site into done or open for every step. Pure: it
 * takes plain values (secrets arrive only as present or not) and returns no
 * value of anything. Never stored.
 */

export type SetupInputs = {
  settings: {
    weddingEventId: string | null;
    /** `YYYY-MM-DD` of the wedding event, or null while it has none. */
    weddingEventDate: string | null;
    rsvpOpen: boolean;
    defaultDeadline: string | null;
    place: string | null;
  };
  env: {
    siteUrl: string;
    emailKey: boolean;
    emailFrom: boolean;
    linkKey: boolean;
    scheduleKey: boolean;
    webhookKey: boolean;
  };
  sms: { configured: boolean; enabled: boolean };
  /** Keys of manual steps a staff member confirmed. */
  confirmed: string[];
};

export type StepStatus = {
  key: string;
  status: "done" | "open";
  reason?: string;
};

export type SetupStatus = {
  steps: StepStatus[];
  requiredOpen: number;
  requiredTotal: number;
  recommendedOpen: number;
};

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const done = (key: string): StepStatus => ({ key, status: "done" });
const open = (key: string, reason: string): StepStatus => ({
  key,
  status: "open",
  reason,
});

function check(key: string, input: SetupInputs): StepStatus {
  const { settings, env, sms, confirmed } = input;
  switch (key) {
    case "site_url":
      if (env.siteUrl.trim() === "")
        return open(key, "The address is not set.");
      return isWebAddress(env.siteUrl)
        ? done(key)
        : open(
            key,
            "That is not a full web address (it should start with https://).",
          );
    case "wedding_event":
      if (!settings.weddingEventId) return open(key, "No event is chosen.");
      return settings.weddingEventDate
        ? done(key)
        : open(
            key,
            "The chosen event has no date yet. Give it one on the Events page.",
          );
    case "email_sending":
      if (!env.emailKey && !env.emailFrom)
        return open(key, "The email key and the from address are not set.");
      if (!env.emailKey) return open(key, "The email key is not set.");
      if (!env.emailFrom) return open(key, "The from address is not set.");
      return done(key);
    case "link_key":
      return env.linkKey ? done(key) : open(key, "The key is not set.");
    case "schedule_key":
      return env.scheduleKey ? done(key) : open(key, "The key is not set.");
    case "card_details":
      return settings.place ? done(key) : open(key, "No place line is set.");
    case "rsvp_deadline":
      return settings.defaultDeadline
        ? done(key)
        : open(key, "No default deadline is set.");
    case "rsvp_closed":
      return settings.rsvpOpen === false
        ? done(key)
        : open(key, "The RSVP is open.");
    case "texting":
      if (!sms.configured)
        return open(key, "The text provider's values are not set.");
      return sms.enabled
        ? done(key)
        : open(key, "Texting is set up but not switched on.");
    case "email_tracking":
      return env.webhookKey
        ? done(key)
        : open(key, "The signing key is not set.");
    default:
      return confirmed.includes(key)
        ? done(key)
        : open(key, "Not confirmed yet.");
  }
}

export function evaluateSetup(input: SetupInputs): SetupStatus {
  const steps = STEPS.map((s) => check(s.key, input));
  const groupOf = (key: string) => STEPS.find((s) => s.key === key)?.group;
  const required = steps.filter((s) => groupOf(s.key) === "required");
  return {
    steps,
    requiredOpen: required.filter((s) => s.status === "open").length,
    requiredTotal: required.length,
    recommendedOpen: steps.filter(
      (s) => groupOf(s.key) === "recommended" && s.status === "open",
    ).length,
  };
}
