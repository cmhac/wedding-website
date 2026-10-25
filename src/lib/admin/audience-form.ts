/**
 * Turns the campaign editor's fields into an audience value (and back), and
 * describes an audience in words for the campaigns table. Plain TypeScript, no
 * server-only code, so the editor and the actions share it.
 */
import {
  audienceSchema,
  type Audience,
  type AudienceFilters,
} from "@/lib/campaigns/audience";

export type AudienceFormResult =
  { ok: true; audience: Audience } | { ok: false; message: string };

export type EventName = { slug: string; name: string };

export const NO_FILTER_MESSAGE =
  "Choose at least one filter, or send to everyone or one household.";
const CHOOSE_EVENT_MESSAGE = "Choose an event for the event filter you ticked.";
const CHOOSE_HOUSEHOLD_MESSAGE = "Choose a household to send to.";
const INVALID_MESSAGE =
  "The audience is not valid. Please check it and try again.";

const text = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};
const ticked = (formData: FormData, name: string) =>
  formData.get(name) !== null;

/** Builds the audience from the editor's fields, or says what is wrong. */
export function audienceFromForm(formData: FormData): AudienceFormResult {
  const scope = text(formData, "audience_scope");
  let candidate: unknown;

  if (scope === "all") {
    candidate = { scope: "all" };
  } else if (scope === "household") {
    const householdId = text(formData, "household_id");
    if (!householdId) return { ok: false, message: CHOOSE_HOUSEHOLD_MESSAGE };
    candidate = { scope: "household", household_id: householdId };
  } else if (scope === "filter") {
    const filters: Record<string, unknown> = {};
    if (ticked(formData, "filter_required_events_unanswered")) {
      filters.required_events_unanswered = true;
    }
    if (ticked(formData, "filter_meals_not_chosen")) {
      filters.meals_not_chosen = true;
    }
    if (ticked(formData, "filter_delivery_problem")) {
      filters.delivery_problem = true;
    }
    for (const name of ["invited_to_event", "optional_event_unanswered"]) {
      if (!ticked(formData, `filter_${name}`)) continue;
      const slug = text(formData, name);
      if (!slug) return { ok: false, message: CHOOSE_EVENT_MESSAGE };
      filters[name] = slug;
    }
    if (ticked(formData, "filter_not_yet_sent_message_type")) {
      // Follows the campaign's own message type unless one is given.
      filters.not_yet_sent_message_type =
        text(formData, "not_yet_sent_message_type") ||
        text(formData, "message_type_key");
    }
    if (Object.keys(filters).length === 0) {
      return { ok: false, message: NO_FILTER_MESSAGE };
    }
    candidate = { scope: "filter", filters };
  } else {
    return { ok: false, message: CHOOSE_HOUSEHOLD_MESSAGE };
  }

  const parsed = audienceSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, audience: parsed.data };
  return {
    ok: false,
    message: scope === "household" ? CHOOSE_HOUSEHOLD_MESSAGE : INVALID_MESSAGE,
  };
}

const MESSAGE_TYPE_WORDS: Record<string, string> = {
  save_the_date: "save the date",
  invitation: "invitation",
  rsvp_reminder: "RSVP reminder",
  optional_events_reminder: "optional events reminder",
  update: "update",
};

/** The words for the campaigns table, for example "Invited to Rehearsal". */
export function describeAudience(
  audience: Audience,
  events: EventName[],
): string {
  if (audience.scope === "all") return "All households";
  if (audience.scope === "household") return "One household";
  const eventName = (slug: string) =>
    events.find((e) => e.slug === slug)?.name ?? slug;
  const f: AudienceFilters = audience.filters;
  const parts: string[] = [];
  if (f.invited_to_event) {
    parts.push(`Invited to ${eventName(f.invited_to_event)}`);
  }
  if (f.required_events_unanswered) parts.push("Required answers outstanding");
  if (f.optional_event_unanswered) {
    parts.push(`${eventName(f.optional_event_unanswered)} answer outstanding`);
  }
  if (f.meals_not_chosen) parts.push("Meals not chosen");
  if (f.not_yet_sent_message_type) {
    const word =
      MESSAGE_TYPE_WORDS[f.not_yet_sent_message_type] ??
      f.not_yet_sent_message_type;
    parts.push(`Not yet sent the ${word}`);
  }
  if (f.delivery_problem) parts.push("Delivery problem");
  // Join in sentence case: only the first part keeps its capital.
  return parts
    .map((part, i) => (i === 0 ? part : part[0].toLowerCase() + part.slice(1)))
    .join(", ");
}

/** The editor's field values for an audience, for refilling the form. */
export function audienceToForm(audience: Audience): Record<string, string> {
  if (audience.scope === "all") return { audience_scope: "all" };
  if (audience.scope === "household") {
    return {
      audience_scope: "household",
      household_id: audience.household_id,
    };
  }
  const f = audience.filters;
  const values: Record<string, string> = { audience_scope: "filter" };
  if (f.required_events_unanswered) {
    values.filter_required_events_unanswered = "on";
  }
  if (f.meals_not_chosen) values.filter_meals_not_chosen = "on";
  if (f.delivery_problem) values.filter_delivery_problem = "on";
  if (f.invited_to_event) {
    values.filter_invited_to_event = "on";
    values.invited_to_event = f.invited_to_event;
  }
  if (f.optional_event_unanswered) {
    values.filter_optional_event_unanswered = "on";
    values.optional_event_unanswered = f.optional_event_unanswered;
  }
  if (f.not_yet_sent_message_type) {
    values.filter_not_yet_sent_message_type = "on";
    values.not_yet_sent_message_type = f.not_yet_sent_message_type;
  }
  return values;
}
