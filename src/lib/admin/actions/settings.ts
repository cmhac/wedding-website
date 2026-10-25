"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { savedSettingsMessage } from "../settings-message";
import { pacificLocalToIso } from "../time";
import { runAdminAction, type ActionResult } from "./shared";

const settingsSchema = z
  .object({
    default_rsvp_deadline: z.string().trim().default(""),
    // A ticked checkbox posts a value; an unticked one posts nothing.
    rsvp_open: z.string().optional(),
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
    return { deadline: converted, rsvp_open: value.rsvp_open !== undefined };
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
