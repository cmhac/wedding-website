"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { pacificLocalToIso } from "../time";
import { runAdminAction, type ActionResult } from "./shared";

const optionalText = (max: number) => z.string().trim().max(max).default("");

const householdFieldsSchema = z
  .object({
    id: z.string().min(1),
    display_name: z.string().trim().min(1).max(200),
    plus_one_allowance: z
      .string()
      .trim()
      .min(1)
      .transform(Number)
      .pipe(
        z
          .number()
          .int("Enter a whole number.")
          .min(0, "Enter 0 or more.")
          .max(20, "Enter 20 or fewer."),
      ),
    rsvp_deadline_override: z.string().trim().default(""),
    address_street: optionalText(200),
    address_city: optionalText(100),
    address_region: optionalText(100),
    address_postal_code: optionalText(20),
    address_country: optionalText(100),
    notes: z.string().trim().max(2000).default(""),
    // A ticked checkbox posts a value; an unticked one posts nothing.
    reminders_opt_out: z.string().optional(),
  })
  .transform((value, ctx) => {
    const deadline = pacificLocalToIso(value.rsvp_deadline_override);
    if (deadline !== null && typeof deadline === "object") {
      ctx.addIssue({
        code: "custom",
        path: ["rsvp_deadline_override"],
        message: deadline.error,
      });
      return z.NEVER;
    }
    const address = Object.fromEntries(
      (
        [
          ["street", value.address_street],
          ["city", value.address_city],
          ["region", value.address_region],
          ["postal_code", value.address_postal_code],
          ["country", value.address_country],
        ] as const
      ).filter(([, text]) => text !== ""),
    );
    return {
      id: value.id,
      patch: {
        display_name: value.display_name,
        plus_one_allowance: value.plus_one_allowance,
        rsvp_deadline_override: deadline,
        address: Object.keys(address).length > 0 ? address : null,
        notes: value.notes === "" ? null : value.notes,
        reminders_opt_out: value.reminders_opt_out !== undefined,
      },
    };
  });

/**
 * Saves everything on a household except its contact email (which goes
 * through the route handler). Asks for no row back: the staff-only columns
 * cannot be read from the table, so the page reloads through staff_households().
 */
export async function updateHouseholdFields(
  _previous: ActionResult | null,
  formData: FormData,
  options: { supabase?: SupabaseClient } = {},
): Promise<ActionResult> {
  return runAdminAction(
    householdFieldsSchema,
    formData,
    async ({ input, supabase }) => {
      const { error } = await supabase
        .from("households")
        .update(input.patch)
        .eq("id", input.id);
      return {
        error,
        revalidate: [`/admin/households/${input.id}`, "/admin/households"],
      };
    },
    { supabase: options.supabase },
  );
}
