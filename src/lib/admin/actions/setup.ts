"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { REQUIRED_KEYS, stepByKey } from "@/lib/setup/steps";
import { pacificLocalToIso } from "../time";
import { runAdminAction, type ActionResult } from "./shared";

/**
 * The setup guide's actions (specs/007-admin-setup-guide, contracts/
 * setup-guide.md). Each is staff only and touches only the caller's own guide
 * state (or the shared confirm-by-hand marks). Nothing here stores whether a
 * step is done: that is always worked out from the live site.
 */

type Options = { supabase?: SupabaseClient };

const knownKey = z
  .string()
  .trim()
  .refine((key) => stepByKey(key) !== undefined, "Unknown setup step.");

const noInput = z.object({});

/** The whole console layout shows the banner, so refresh it, not one page. */
function refreshConsole() {
  revalidatePath("/admin", "layout");
}

type StateRow = {
  skipped_steps: string[];
  last_step: string | null;
};

async function ownState(
  supabase: SupabaseClient,
  userId: string,
): Promise<StateRow> {
  const { data } = await supabase
    .from("setup_guide_state")
    .select("skipped_steps, last_step")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as Partial<StateRow> | null;
  return {
    skipped_steps: row?.skipped_steps ?? [],
    last_step: row?.last_step ?? null,
  };
}

function saveState(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
) {
  return supabase
    .from("setup_guide_state")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
}

const leaveSchema = z.object({
  /** The step the person was on, if any. */
  step: z.string().trim().default(""),
  /** The required steps that exist now, comma separated. */
  seen: z.string().trim().default(""),
});

/**
 * Closing the guide by any route. Remembers where the person was and which
 * required steps existed, so a step added later brings the full banner back.
 */
export async function leaveGuide(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    leaveSchema,
    formData,
    async ({ input, supabase, user }) => {
      const seen = input.seen
        .split(",")
        .map((k) => k.trim())
        .filter((k) => REQUIRED_KEYS.includes(k));
      const step = stepByKey(input.step) ? input.step : null;
      const { error } = await saveState(supabase, user.id, {
        left_guide: true,
        seen_required: seen,
        ...(step ? { last_step: step } : {}),
      });
      if (!error) refreshConsole();
      return { error };
    },
    { supabase: options.supabase },
  );
}

/** Opening the guide again from the compact reminder. */
export async function resumeGuide(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    noInput,
    formData,
    async ({ supabase, user }) => {
      const { error } = await saveState(supabase, user.id, {
        left_guide: false,
      });
      if (!error) refreshConsole();
      return { error };
    },
    { supabase: options.supabase },
  );
}

const stepSchema = z.object({ step: knownKey });

/** Remembers the step the person is looking at, so resume returns to it. */
export async function recordPosition(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    stepSchema,
    formData,
    async ({ input, supabase, user }) => {
      const { error } = await saveState(supabase, user.id, {
        last_step: input.step,
      });
      return { error };
    },
    { supabase: options.supabase },
  );
}

/** Marks a step skipped for this person. It still counts as open everywhere. */
export async function skipStep(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    stepSchema,
    formData,
    async ({ input, supabase, user }) => {
      const current = await ownState(supabase, user.id);
      const skipped = Array.from(
        new Set([...current.skipped_steps, input.step]),
      );
      const { error } = await saveState(supabase, user.id, {
        skipped_steps: skipped,
      });
      if (!error) refreshConsole();
      return { error };
    },
    { supabase: options.supabase },
  );
}

/**
 * Restart: forgets this person's skips, position and left state. It changes no
 * value of the site and no one else's state.
 */
export async function restartGuide(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    noInput,
    formData,
    async ({ supabase, user }) => {
      const { error } = await supabase
        .from("setup_guide_state")
        .delete()
        .eq("user_id", user.id);
      if (!error) refreshConsole();
      return { error };
    },
    { supabase: options.supabase },
  );
}

const manualSchema = z.object({
  step: knownKey.refine(
    (key) => stepByKey(key)?.kind === "manual",
    "This step is checked by the site, so it cannot be confirmed by hand.",
  ),
});

/** Confirm a step the site cannot check. A shared mark. */
export async function confirmStep(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    manualSchema,
    formData,
    async ({ input, supabase, user }) => {
      const { error } = await supabase
        .from("setup_confirmations")
        .upsert(
          { step_key: input.step, confirmed_by: user.id },
          { onConflict: "step_key" },
        );
      if (!error) refreshConsole();
      return { error };
    },
    { supabase: options.supabase },
  );
}

export async function unconfirmStep(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    manualSchema,
    formData,
    async ({ input, supabase }) => {
      const { error } = await supabase
        .from("setup_confirmations")
        .delete()
        .eq("step_key", input.step);
      if (!error) refreshConsole();
      return { error };
    },
    { supabase: options.supabase },
  );
}

/** "Check again": re-reads the site so a value set in hosting shows up. */
export async function checkAgain(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    noInput,
    formData,
    async () => {
      refreshConsole();
    },
    { supabase: options.supabase },
  );
}

const setValueSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("wedding_event"),
    wedding_event_id: z.guid("Choose an event."),
  }),
  z.object({
    step: z.literal("card_details"),
    save_the_date_place: z
      .string()
      .trim()
      .min(1, "Enter the place line.")
      .max(200, "Keep the place to 200 characters or fewer."),
    save_the_date_note: z
      .string()
      .trim()
      .max(300, "Keep the note to 300 characters or fewer.")
      .default(""),
  }),
  z.object({
    step: z.literal("rsvp_deadline"),
    default_rsvp_deadline: z.string().trim().min(1, "Choose a date and time."),
  }),
  z.object({ step: z.literal("rsvp_closed") }),
]);

/**
 * Saves the value of a step set in the console: the same columns the Settings
 * page writes, one field group at a time, so saving one step never clears
 * another. Staff only (the database enforces it too).
 */
export async function saveSetupValue(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    setValueSchema.transform((value, ctx) => {
      if (value.step !== "rsvp_deadline") return value;
      const converted = pacificLocalToIso(value.default_rsvp_deadline);
      if (converted !== null && typeof converted === "object") {
        ctx.addIssue({
          code: "custom",
          path: ["default_rsvp_deadline"],
          message: converted.error,
        });
        return z.NEVER;
      }
      return { ...value, deadlineIso: converted };
    }),
    formData,
    async ({ input, supabase }) => {
      const patch: Record<string, unknown> =
        input.step === "wedding_event"
          ? { wedding_event_id: input.wedding_event_id }
          : input.step === "card_details"
            ? {
                save_the_date_place: input.save_the_date_place,
                save_the_date_note: input.save_the_date_note || null,
              }
            : input.step === "rsvp_deadline"
              ? {
                  default_rsvp_deadline: (
                    input as { deadlineIso: string | null }
                  ).deadlineIso,
                }
              : { rsvp_open: false };
      const { error } = await supabase
        .from("settings")
        .update(patch)
        .eq("id", true);
      if (!error) refreshConsole();
      return { error, revalidate: ["/admin/settings"] };
    },
    { supabase: options.supabase },
  );
}
