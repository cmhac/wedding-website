"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAdminAction, type ActionResult } from "./shared";

type Options = { supabase?: SupabaseClient };
type Saved = { message: string };

const required = (message: string) => z.string().trim().min(1, message);

/** The household pages show these answers; refresh them whichever one is open. */
function refreshHouseholdPages() {
  revalidatePath("/admin/households/[id]", "page");
}

const inviteSchema = z.object({
  event_id: required("Choose an event."),
  // One checkbox posts a string; several post a list.
  guest_ids: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      (value === undefined
        ? []
        : Array.isArray(value)
          ? value
          : [value]
      ).filter(Boolean),
    )
    .refine((ids) => ids.length > 0, "Choose at least one guest."),
});

export type InviteResult = Saved & {
  added: number;
  existing: number;
  unknown: number;
};

/** "2 added, 1 already invited, 0 not found". */
function inviteMessage(added: number, existing: number, unknown: number) {
  return `${added} added, ${existing} already invited, ${unknown} not found`;
}

/** Invites the chosen guests to an event. Sends no email. */
export async function inviteGuests(
  _previous: ActionResult<Saved> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<InviteResult>> {
  return runAdminAction(
    inviteSchema,
    formData,
    async ({ input, supabase }) => {
      const { data, error } = await supabase.rpc("invite", {
        guest_ids: input.guest_ids,
        event_id: input.event_id,
      });
      if (error) return { error };
      const counts = (data ?? {}) as Record<string, unknown>;
      const added = Number(counts.added ?? 0);
      const existing = Number(counts.existing ?? 0);
      const unknown = Number(counts.unknown ?? 0);
      refreshHouseholdPages();
      return {
        revalidate: ["/admin/events"],
        data: {
          message: inviteMessage(added, existing, unknown),
          added,
          existing,
          unknown,
        },
      };
    },
    { supabase: options.supabase },
  );
}

const removeSchema = z.object({
  guest_id: required("Choose a guest."),
  event_id: required("Choose an event."),
  // The confirm step posts this; a direct post without it is refused.
  confirmed: z.literal("yes", { error: "Confirm the removal first." }),
});

/** Removes one guest's invitation to one event, after the confirm step. */
export async function removeInvitation(
  _previous: ActionResult<Saved> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<Saved>> {
  return runAdminAction(
    removeSchema,
    formData,
    async ({ input, supabase }) => {
      const { error } = await supabase
        .from("invitations")
        .delete()
        .eq("guest_id", input.guest_id)
        .eq("event_id", input.event_id);
      if (error) return { error };
      refreshHouseholdPages();
      return {
        revalidate: ["/admin/events"],
        data: { message: "Invitation removed." },
      };
    },
    { supabase: options.supabase },
  );
}

const rsvpSchema = z.object({
  guest_id: required("Choose a guest."),
  event_id: required("Choose an event."),
  status: z.enum(["pending", "attending", "declined"], {
    error: "Choose pending, attending or declined.",
  }),
});

/**
 * Records a guest's answer on their behalf, as staff. Neither the deadline
 * nor the RSVPs-open setting applies to staff.
 */
export async function recordRsvp(
  _previous: ActionResult<Saved> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<Saved>> {
  return runAdminAction(
    rsvpSchema,
    formData,
    async ({ input, supabase }) => {
      const { error } = await supabase.rpc("staff_set_rsvp", {
        guest_id: input.guest_id,
        event_id: input.event_id,
        status: input.status,
      });
      if (error) return { error };
      refreshHouseholdPages();
      return {
        revalidate: ["/admin/events"],
        data: { message: "Answer saved." },
      };
    },
    { supabase: options.supabase },
  );
}

const mealSchema = z.object({
  guest_id: required("Choose a guest."),
  course_id: required("Choose a course."),
  // Empty means "no choice": it clears the guest's pick for the course.
  dish_id: z.string().trim().default(""),
});

/** Sets or clears a guest's dish for a course on their behalf, as staff. */
export async function recordMeal(
  _previous: ActionResult<Saved> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<Saved>> {
  return runAdminAction(
    mealSchema,
    formData,
    async ({ input, supabase }) => {
      const dishId = input.dish_id || null;
      const { error } = await supabase.rpc("staff_set_meal", {
        course_id: input.course_id,
        dish_id: dishId as unknown as string,
        guest_id: input.guest_id,
      });
      if (error) return { error };
      refreshHouseholdPages();
      return {
        data: {
          message: dishId ? "Meal choice saved." : "Meal choice cleared.",
        },
      };
    },
    { supabase: options.supabase },
  );
}
