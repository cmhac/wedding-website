/**
 * Request and response schemas for the guest API (contracts/guest-api.md).
 * Plain zod modules: the designer's frontend and the route handlers share them.
 *
 * Meals and dietary fields are added to the RSVP schemas in the later meals
 * stage; every object here is a plain z.object so they can be extended.
 */
import { z } from "zod";

export const signInRequestSchema = z.object({ email: z.email().max(320) });
export const signInResponseSchema = z.object({ message: z.string() });

export const rsvpStatusSchema = z.enum(["attending", "declined"]);

export const guestRsvpInputSchema = z.object({
  guest_id: z.uuid(),
  responses: z
    .array(z.object({ event_id: z.uuid(), status: rsvpStatusSchema }))
    .max(50),
});

export const rsvpSubmitSchema = z.object({
  message_to_couple: z.string().max(5000).nullable().optional(),
  guests: z.array(guestRsvpInputSchema).min(1).max(50),
});

export const plusOneRequestSchema = z.object({
  guest_id: z.uuid(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
});

export const optOutRequestSchema = z.object({ opt_out: z.boolean() });
export const optOutResponseSchema = z.object({ opt_out: z.boolean() });

const eventSchema = z.looseObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  starts_at: z.string(),
  venue_name: z.string().nullable().optional(),
  is_required: z.boolean(),
  group_key: z.string().nullable().optional(),
  display_order: z.number().nullable().optional(),
  deadline: z.string().nullable(),
  closed: z.boolean(),
});

const invitationSchema = z.looseObject({
  status: z.enum(["pending", "attending", "declined"]),
  event: eventSchema,
  // Menus are added in the meals stage.
  menu: z.unknown().optional(),
});

export const guestSchema = z.looseObject({
  id: z.uuid(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  is_placeholder: z.boolean(),
  invitations: z.array(invitationSchema),
});

export const rsvpResponseSchema = z.looseObject({
  household: z.looseObject({
    display_name: z.string(),
    plus_one_allowance: z.number(),
    message_to_couple: z.string().nullable(),
    reminders_opt_out: z.boolean(),
  }),
  guests: z.array(guestSchema),
});

export const errorBodySchema = z.looseObject({
  error: z.looseObject({
    code: z.string(),
    message: z.string(),
    issues: z
      .array(
        z.looseObject({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;
export type RsvpSubmit = z.infer<typeof rsvpSubmitSchema>;
export type PlusOneRequest = z.infer<typeof plusOneRequestSchema>;
export type OptOutRequest = z.infer<typeof optOutRequestSchema>;
export type OptOutResponse = z.infer<typeof optOutResponseSchema>;
export type RsvpResponse = z.infer<typeof rsvpResponseSchema>;
export type Guest = z.infer<typeof guestSchema>;
export type ErrorBody = z.infer<typeof errorBodySchema>;
