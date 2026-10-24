import { z } from "zod";

/**
 * Audience filter schema (contracts/audience-filter.md). Exported for the admin
 * frontend; mirrors the database check `is_valid_audience`.
 */

export const MESSAGE_TYPE_KEYS = [
  "save_the_date",
  "invitation",
  "rsvp_reminder",
  "optional_events_reminder",
  "update",
] as const;

const eventSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const filtersSchema = z
  .strictObject({
    invited_to_event: eventSlug,
    required_events_unanswered: z.literal(true),
    optional_event_unanswered: eventSlug,
    meals_not_chosen: z.literal(true),
    not_yet_sent_message_type: z.enum(MESSAGE_TYPE_KEYS),
    delivery_problem: z.literal(true),
  })
  .partial()
  .refine((f) => Object.keys(f).length > 0, {
    message: "a filter audience needs at least one filter",
  });

export const audienceSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("all") }),
  z.strictObject({ scope: z.literal("household"), household_id: z.guid() }),
  z.strictObject({ scope: z.literal("filter"), filters: filtersSchema }),
]);

export type Audience = z.infer<typeof audienceSchema>;
export type AudienceFilters = z.infer<typeof filtersSchema>;
export type MessageTypeKey = (typeof MESSAGE_TYPE_KEYS)[number];
