"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAdminAction, type ActionResult } from "./shared";

const NO_PLUS_ONES_LEFT =
  "This household has no plus-ones left. Raise its plus-one allowance first.";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default("")
    .transform((text) => (text === "" ? null : text));

const checked = z
  .string()
  .optional()
  .transform((value) => value === "true" || value === "on");

const guestSchema = z
  .object({
    household_id: z.string().min(1),
    guest_id: z.string().optional().default(""),
    // On a new guest: an unnamed seat. On an existing guest: it is a seat
    // being named.
    is_placeholder: checked,
    is_plus_one: checked,
    first_name: z.string().trim().max(100).default(""),
    last_name: z.string().trim().max(100).default(""),
    email: z
      .string()
      .trim()
      .max(320)
      .default("")
      .refine((v) => v === "" || z.email().safeParse(v).success, {
        message: "Enter a valid email address.",
      })
      .transform((v) => (v === "" ? null : v)),
    dietary_notes: optionalText(2000),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    const unnamedSeat = value.is_placeholder && value.guest_id === "";
    if (unnamedSeat) return;
    for (const field of ["first_name", "last_name"] as const) {
      if (value[field] === "") {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "This is required.",
        });
      }
    }
  });

/** Adds a guest, edits one, adds an unnamed plus-one seat, or names a seat. */
export async function saveGuest(
  _previous: ActionResult | null,
  formData: FormData,
  options: { supabase?: SupabaseClient } = {},
): Promise<ActionResult> {
  let overAllowance = false;
  const result = await runAdminAction(
    guestSchema,
    formData,
    async ({ input, supabase }) => {
      const details = {
        email: input.email,
        dietary_notes: input.dietary_notes,
        notes: input.notes,
      };
      const names = {
        first_name: input.first_name,
        last_name: input.last_name,
      };
      let error: { message?: string | null; code?: string | null } | null;

      if (input.guest_id === "") {
        const row = input.is_placeholder
          ? {
              household_id: input.household_id,
              is_placeholder: true,
              is_plus_one: true,
            }
          : {
              household_id: input.household_id,
              ...names,
              ...details,
              is_placeholder: false,
              is_plus_one: input.is_plus_one,
            };
        ({ error } = await supabase.from("guests").insert(row));
      } else {
        const patch = input.is_placeholder
          ? { ...names, ...details, is_placeholder: false, is_plus_one: true }
          : { ...names, ...details };
        ({ error } = await supabase
          .from("guests")
          .update(patch)
          .eq("id", input.guest_id)
          .eq("household_id", input.household_id));
      }

      if (
        error?.code === "23505" ||
        /guests_unique_name/i.test(error?.message ?? "")
      ) {
        error = { message: "duplicate_name" };
      } else if (/plus-one allowance exceeded/i.test(error?.message ?? "")) {
        overAllowance = true;
      }
      return { error, revalidate: [`/admin/households/${input.household_id}`] };
    },
    { supabase: options.supabase },
  );
  return !result.ok && overAllowance
    ? { ...result, message: NO_PLUS_ONES_LEFT }
    : result;
}

const removeGuestSchema = z.object({
  household_id: z.string().min(1),
  guest_id: z.string().min(1),
  confirm: z.string().optional().default(""),
});

/** Deletes a guest, but only once the confirmation step has been shown. */
export async function removeGuest(
  _previous: ActionResult | null,
  formData: FormData,
  options: { supabase?: SupabaseClient } = {},
): Promise<ActionResult> {
  return runAdminAction(
    removeGuestSchema,
    formData,
    async ({ input, supabase }) => {
      if (input.confirm === "") {
        return { error: { message: "confirmation_missing" } };
      }
      const { error } = await supabase
        .from("guests")
        .delete()
        .eq("id", input.guest_id)
        .eq("household_id", input.household_id);
      return { error, revalidate: [`/admin/households/${input.household_id}`] };
    },
    { supabase: options.supabase },
  );
}

/**
 * The action behind the confirmation panel: removes the guest, then returns
 * to the guests tab with a notice. The panel's form passes only form data.
 */
export async function confirmRemoveGuest(
  formData: FormData,
  options: { supabase?: SupabaseClient } = {},
): Promise<void> {
  const result = await removeGuest(null, formData, options);
  const id = String(formData.get("household_id") ?? "");
  const notice = result.ok ? "guest-removed" : "guest-not-removed";
  redirect(`/admin/households/${id}?tab=guests&notice=${notice}`);
}

const dietarySchema = z.object({
  household_id: z.string().min(1),
  guest_id: z.string().min(1),
  op: z.enum(["add", "remove"]),
  category_key: z.string().trim().min(1),
  severity: z.enum(["allergy", "preference"]).optional(),
  details: optionalText(500),
});

/** Adds, changes or removes one dietary entry for a guest. */
export async function setGuestDietary(
  _previous: ActionResult | null,
  formData: FormData,
  options: { supabase?: SupabaseClient } = {},
): Promise<ActionResult> {
  return runAdminAction(
    dietarySchema.superRefine((value, ctx) => {
      if (value.op === "add" && value.severity === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["severity"],
          message: "Choose allergy or preference.",
        });
      }
    }),
    formData,
    async ({ input, supabase }) => {
      const { error } =
        input.op === "add"
          ? await supabase.from("guest_dietary").upsert(
              {
                guest_id: input.guest_id,
                category_key: input.category_key,
                severity: input.severity,
                details: input.details,
              },
              { onConflict: "guest_id,category_key" },
            )
          : await supabase
              .from("guest_dietary")
              .delete()
              .eq("guest_id", input.guest_id)
              .eq("category_key", input.category_key);
      return { error, revalidate: [`/admin/households/${input.household_id}`] };
    },
    { supabase: options.supabase },
  );
}
