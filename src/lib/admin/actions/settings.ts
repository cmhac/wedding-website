"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { savedSettingsMessage } from "../settings-message";
import { pacificLocalToIso } from "../time";
import { runAdminAction, type ActionResult } from "./shared";

/** A whole number of 1 or more, from a form field; absent when the field is. */
const whole = () =>
  z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{0,5}$/, "Enter a whole number, 1 or more.")
    .transform(Number)
    .optional();

const settingsSchema = z
  .object({
    default_rsvp_deadline: z.string().trim().default(""),
    // A ticked checkbox posts a value; an unticked one posts nothing.
    rsvp_open: z.string().optional(),
    // The wedding event and the sign-in limits are saved only when the form
    // includes them ("" for the event means none chosen).
    wedding_event_id: z.union([z.guid(), z.literal("")]).optional(),
    sign_in_limit_per_address: whole(),
    sign_in_window_minutes: whole(),
    sign_in_limit_global_per_hour: whole(),
  })
  .transform((value, ctx) => {
    const converted = pacificLocalToIso(value.default_rsvp_deadline);
    if (converted !== null && typeof converted === "object") {
      ctx.addIssue({
        code: "custom",
        path: ["default_rsvp_deadline"],
        message: converted.error,
      });
      return z.NEVER;
    }
    return {
      deadline: converted,
      rsvp_open: value.rsvp_open !== undefined,
      extra: {
        ...(value.wedding_event_id !== undefined
          ? { wedding_event_id: value.wedding_event_id || null }
          : {}),
        ...(value.sign_in_limit_per_address !== undefined
          ? { sign_in_limit_per_address: value.sign_in_limit_per_address }
          : {}),
        ...(value.sign_in_window_minutes !== undefined
          ? { sign_in_window_minutes: value.sign_in_window_minutes }
          : {}),
        ...(value.sign_in_limit_global_per_hour !== undefined
          ? {
              sign_in_limit_global_per_hour:
                value.sign_in_limit_global_per_hour,
            }
          : {}),
      },
    };
  });

/** Saves the default RSVP deadline and whether RSVPs are open (staff). */
export async function saveSettings(
  _previous: ActionResult<{ message: string }> | null,
  formData: FormData,
  options: { supabase?: SupabaseClient } = {},
): Promise<ActionResult<{ message: string }>> {
  return runAdminAction(
    settingsSchema,
    formData,
    async ({ input, supabase }) => {
      const { error } = await supabase
        .from("settings")
        .update({
          default_rsvp_deadline: input.deadline,
          rsvp_open: input.rsvp_open,
          ...input.extra,
        })
        .eq("id", true);
      return {
        error,
        revalidate: ["/admin/settings"],
        data: { message: savedSettingsMessage(input.deadline) },
      };
    },
    { supabase: options.supabase },
  );
}
