"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pacificLocalToIso } from "../time";
import { runAdminAction, type ActionResult } from "./shared";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const DUPLICATE_SLUG =
  "Another event already uses that short key. Choose a different one.";

type Options = { supabase?: SupabaseClient };

const text = z.string().trim().default("");

const eventSchema = z
  .object({
    /** Present when editing an existing event. */
    id: z.string().trim().optional(),
    slug: text,
    name: z.string().trim().min(1, "Enter a name for the event."),
    starts_at: text,
    venue_name: text,
    group_key: text,
    rsvp_deadline: text,
    display_order: text,
    // A ticked checkbox posts a value; an unticked one posts nothing.
    is_required: z.string().optional(),
  })
  .transform((value, ctx) => {
    const fail = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
    };
    const editing = Boolean(value.id);

    if (!editing) {
      if (!value.slug) fail("slug", "Enter a short key.");
      else if (!SLUG_PATTERN.test(value.slug)) {
        fail(
          "slug",
          "Use lowercase letters, digits and hyphens only, for example after-party.",
        );
      }
    }

    const startsAt = pacificLocalToIso(value.starts_at);
    if (startsAt !== null && typeof startsAt === "object") {
      fail("starts_at", startsAt.error);
    }
    const deadline = pacificLocalToIso(value.rsvp_deadline);
    if (deadline !== null && typeof deadline === "object") {
      fail("rsvp_deadline", deadline.error);
    }

    const order = Number(value.display_order);
    if (
      !/^-?\d+$/.test(value.display_order) ||
      order < -32768 ||
      order > 32767
    ) {
      fail("display_order", "Enter a whole number between -32768 and 32767.");
    }

    return {
      id: value.id || undefined,
      slug: value.slug,
      fields: {
        name: value.name,
        starts_at: typeof startsAt === "string" ? startsAt : null,
        venue_name: value.venue_name || null,
        is_required: value.is_required !== undefined,
        group_key: value.group_key || null,
        rsvp_deadline: typeof deadline === "string" ? deadline : null,
        display_order: order,
      },
    };
  });

/**
 * Creates an event, or edits one when the form carries its `id`. The short
 * key is set on creation only; a changed value on edit is ignored.
 */
export async function saveEvent(
  _previous: ActionResult<{ message: string }> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<{ message: string }>> {
  let duplicate = false;
  const result = await runAdminAction(
    eventSchema,
    formData,
    async ({ input, supabase }) => {
      const { error } = input.id
        ? await supabase.from("events").update(input.fields).eq("id", input.id)
        : await supabase
            .from("events")
            .insert({ slug: input.slug, ...input.fields });
      if (error?.code === "23505") duplicate = true;
      return {
        error,
        revalidate: ["/admin/events"],
        data: { message: "Event saved." },
      };
    },
    { supabase: options.supabase },
  );
  if (!result.ok && duplicate) {
    return {
      ...result,
      message: DUPLICATE_SLUG,
      fieldErrors: { slug: DUPLICATE_SLUG },
    };
  }
  return result;
}

const deleteSchema = z.object({
  id: z.string().trim().min(1),
  // The confirm step posts this; a direct post without it is refused.
  confirmed: z.literal("yes", { error: "Confirm the deletion first." }),
});

/** Deletes an event and its invitations, after the confirm step. */
export async function deleteEvent(
  _previous: ActionResult<{
    message: string;
    removedInvitations: number;
  }> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<{ message: string; removedInvitations: number }>> {
  return runAdminAction(
    deleteSchema,
    formData,
    async ({ input, supabase }) => {
      const invitations = await supabase
        .from("invitations")
        .select("guest_id")
        .eq("event_id", input.id);
      if (invitations.error) return { error: invitations.error };
      const removed = invitations.data?.length ?? 0;

      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", input.id);
      return {
        error,
        revalidate: ["/admin/events"],
        data: {
          message: `Event deleted. ${removed} ${
            removed === 1 ? "invitation was" : "invitations were"
          } removed.`,
          removedInvitations: removed,
        },
      };
    },
    { supabase: options.supabase },
  );
}

/**
 * The form action behind the delete confirm step: deletes, then goes back to
 * the events list (or to the event with a notice when it failed).
 */
export async function confirmDeleteEvent(
  formData: FormData,
  options: Options = {},
): Promise<void> {
  const result = await deleteEvent(null, formData, options);
  if (result.ok) redirect("/admin/events?notice=deleted");
  const id = encodeURIComponent(String(formData.get("id") ?? ""));
  redirect(`/admin/events?tab=edit&id=${id}&notice=delete_failed`);
}
