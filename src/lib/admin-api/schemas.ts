import { z } from "zod";

/**
 * Request and response schemas for the admin route handlers (see
 * specs/001-guest-data-model/contracts/admin-api.md). Plain zod: no React, no
 * styling. Later stories add their schemas here.
 */

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z
      .array(z.object({ path: z.array(z.any()), message: z.string() }))
      .optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

const email = z.email().max(320);

export const addressSchema = z
  .object({
    street: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    postal_code: z.string().max(20).optional(),
    country: z.string().max(100).optional(),
  })
  .strict();

export const newGuestSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: email.nullish(),
  dietary_notes: z.string().max(2000).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const createHouseholdRequestSchema = z.object({
  display_name: z.string().trim().min(1).max(200),
  contact_email: email.nullish(),
  plus_one_allowance: z.number().int().min(0).max(20).default(0),
  address: addressSchema.nullish(),
  notes: z.string().max(2000).nullish(),
  guests: z.array(newGuestSchema).min(1).max(30),
});
export type CreateHouseholdRequest = z.infer<
  typeof createHouseholdRequestSchema
>;

export const updateHouseholdRequestSchema = z
  .object({
    contact_email: email.nullable(),
    display_name: z.string().trim().min(1).max(200),
    plus_one_allowance: z.number().int().min(0).max(20),
    address: addressSchema.nullable(),
    notes: z.string().max(2000).nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });
export type UpdateHouseholdRequest = z.infer<
  typeof updateHouseholdRequestSchema
>;

export const householdSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  contact_email: z.string().nullable(),
  plus_one_allowance: z.number(),
  /** True when there is no contact email, so the household needs paper. */
  paper_only: z.boolean(),
});
export type HouseholdResponse = z.infer<typeof householdSchema>;

export const createHouseholdResponseSchema = z.object({
  household: householdSchema,
  guest_ids: z.array(z.string()),
});
export type CreateHouseholdResponse = z.infer<
  typeof createHouseholdResponseSchema
>;

export const updateHouseholdResponseSchema = z.object({
  household: householdSchema,
});
export type UpdateHouseholdResponse = z.infer<
  typeof updateHouseholdResponseSchema
>;

export const importErrorSchema = z.object({
  row: z.number().int(),
  field: z.string(),
  message: z.string(),
});

export const importResponseSchema = z.object({
  created: z.object({
    households: z.number().int(),
    guests: z.number().int(),
    invitations: z.number().int(),
  }),
  errors: z.array(importErrorSchema),
  source: z.object({
    format: z.enum(["csv", "xlsx"]),
    sheet: z
      .object({
        name: z.string(),
        index: z.number().int(),
        count: z.number().int(),
      })
      .optional(),
  }),
});
export type ImportResponse = z.infer<typeof importResponseSchema>;
