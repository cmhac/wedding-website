"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { savedSettingsMessage } from "../settings-message";
import { isSmsConfigured } from "@/lib/sms/state";
import { messageFor } from "../messages";
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

const smsSwitchSchema = z.object({
  // A ticked checkbox posts a value; an unticked one posts nothing.
  sms_enabled: z.string().optional(),
});

/**
 * The couple's on/off switch for texting (couple only; the database refuses a
 * planner too). Turning it on texts nobody: guests are asked to opt in at their
 * next sign-in. Refused while the provider is not configured.
 */
export async function saveSmsSwitch(
  _previous: ActionResult<{ message: string }> | null,
  formData: FormData,
  options: { supabase?: SupabaseClient } = {},
): Promise<ActionResult<{ message: string }>> {
  if (!isSmsConfigured()) {
    return { ok: false, message: messageFor("texting_not_configured") };
  }
  return runAdminAction(
    smsSwitchSchema,
    formData,
    async ({ input, supabase }) => {
      const enabled = input.sms_enabled !== undefined;
      const { error } = await supabase
        .from("settings")
        .update({ sms_enabled: enabled })
        .eq("id", true);
      return {
        error,
        revalidate: ["/admin/settings"],
        data: {
          message: enabled
            ? "Texting is on. Nobody is texted yet: guests are asked to opt in at their next sign-in."
            : "Texting is off. No texts are sent and guests are not asked to opt in.",
        },
      };
    },
    { supabase: options.supabase, coupleOnly: true },
  );
}
