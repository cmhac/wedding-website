"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { messageFor } from "../messages";
import { formDataToObject, runAdminAction, type ActionResult } from "./shared";

const MENUS_PATH = "/admin/menus";

const text = (message: string) => z.string().trim().min(1, message);
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));
const id = z.uuid("Choose a valid item.");
const oneOrMany = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value],
  );

function menuUrl(slug: string, extra: Record<string, string> = {}): string {
  const search = new URLSearchParams({ event: slug, tab: "menu", ...extra });
  return `${MENUS_PATH}?${search.toString()}`;
}

// ---------------------------------------------------------------------------
// Menu status
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  event_id: id,
  status: z.enum(["draft", "published", "closed"], {
    error: "Choose draft, published or closed.",
  }),
});

/** Sets a menu's status, creating the event's menu (one per event) if it has none. */
export async function setMenuStatus(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAdminAction(statusSchema, formData, async ({ input, supabase }) => {
    const { error } = await supabase
      .from("menus")
      .upsert(
        { event_id: input.event_id, status: input.status },
        { onConflict: "event_id" },
      );
    return { error, revalidate: [MENUS_PATH] };
  });
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

const requiresChoice = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return true;
    const values = Array.isArray(value) ? value : [value];
    // A checkbox sends "true" after a hidden "false"; unchecked sends only "false".
    return values.includes("true") || values.includes("on");
  });

const courseSchema = z.object({
  id: id.optional(),
  menu_id: id,
  name: text("Enter a course name."),
  display_order: z
    .string()
    .regex(/^-?\d+$/, "Enter a whole number.")
    .transform(Number)
    .refine((n) => Math.abs(n) <= 32767, "Enter a smaller number."),
  requires_choice: requiresChoice,
});

export async function saveCourse(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAdminAction(courseSchema, formData, async ({ input, supabase }) => {
    const fields = {
      name: input.name,
      display_order: input.display_order,
      requires_choice: input.requires_choice,
    };
    const { error } = input.id
      ? await supabase.from("courses").update(fields).eq("id", input.id)
      : await supabase
          .from("courses")
          .insert({ menu_id: input.menu_id, ...fields });
    return { error, revalidate: [MENUS_PATH] };
  });
}

// ---------------------------------------------------------------------------
// Dishes
// ---------------------------------------------------------------------------

const dishSchema = z.object({
  id: id.optional(),
  event_id: id,
  course_id: id,
  name: text("Enter a dish name."),
  description: optionalText,
  tags: oneOrMany,
});

const WRONG_EVENT = "That course belongs to a different event.";

export async function saveDish(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let wrongEvent = false;
  const result = await runAdminAction(
    dishSchema,
    formData,
    async ({ input, supabase }) => {
      const course = await supabase
        .from("courses")
        .select("menu_id")
        .eq("id", input.course_id)
        .maybeSingle();
      if (course.error) return { error: course.error };
      const menu = course.data
        ? await supabase
            .from("menus")
            .select("event_id")
            .eq("id", (course.data as { menu_id: string }).menu_id)
            .maybeSingle()
        : null;
      if (menu?.error) return { error: menu.error };
      if (
        !menu?.data ||
        (menu.data as { event_id: string }).event_id !== input.event_id
      ) {
        wrongEvent = true;
        return;
      }

      const dishId = input.id ?? crypto.randomUUID();
      const fields = {
        course_id: input.course_id,
        name: input.name,
        description: input.description,
      };
      const saved = input.id
        ? await supabase.from("dishes").update(fields).eq("id", dishId)
        : await supabase.from("dishes").insert({ id: dishId, ...fields });
      if (saved.error) return { error: saved.error };

      // The checked categories replace the dish's whole tag set.
      const cleared = await supabase
        .from("dish_tags")
        .delete()
        .eq("dish_id", dishId);
      if (cleared.error) return { error: cleared.error };
      const keys = [...new Set(input.tags)];
      if (keys.length > 0) {
        const tagged = await supabase
          .from("dish_tags")
          .insert(keys.map((key) => ({ dish_id: dishId, category_key: key })));
        if (tagged.error) return { error: tagged.error };
      }
      return { revalidate: [MENUS_PATH] };
    },
  );
  if (wrongEvent) {
    return {
      ok: false,
      message: messageFor("invalid_request"),
      fieldErrors: { course_id: WRONG_EVENT },
      values: formDataToObject(formData),
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Archive and restore
// ---------------------------------------------------------------------------

const dishRefSchema = z.object({
  event: text("Choose an event."),
  dish_id: id,
});

/** Error codes the menu page can show after a refused archive or restore. */
const ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "server_error",
] as const;

function errorCodeFor(message: string): string {
  return (
    ERROR_CODES.find((code) => messageFor(code) === message) ?? "server_error"
  );
}

/**
 * Archives a dish (its guests' choices move to history) and redirects to the
 * menu with how many guests and households must choose again.
 */
export async function archiveDish(formData: FormData): Promise<void> {
  const slug = String(formData.get("event") ?? "");
  const result = await runAdminAction(
    dishRefSchema,
    formData,
    async ({ input, supabase }) => {
      const { data, error } = await supabase.rpc("archive_dish", {
        dish_id: input.dish_id,
      });
      if (error) return { error };
      const rows = (data ?? []) as { guest_id: string; household_id: string }[];
      return {
        revalidate: [MENUS_PATH],
        data: {
          guests: rows.length,
          households: new Set(rows.map((r) => r.household_id)).size,
        },
      };
    },
  );
  if (!result.ok)
    redirect(menuUrl(slug, { error: errorCodeFor(result.message) }));
  redirect(
    menuUrl(slug, {
      archived: String(result.data?.guests ?? 0),
      households: String(result.data?.households ?? 0),
    }),
  );
}

export async function restoreDish(formData: FormData): Promise<void> {
  const slug = String(formData.get("event") ?? "");
  const result = await runAdminAction(
    dishRefSchema,
    formData,
    async ({ input, supabase }) => {
      const { error } = await supabase
        .from("dishes")
        .update({ archived_at: null })
        .eq("id", input.dish_id);
      return { error, revalidate: [MENUS_PATH] };
    },
  );
  if (!result.ok)
    redirect(menuUrl(slug, { error: errorCodeFor(result.message) }));
  redirect(menuUrl(slug));
}

// ---------------------------------------------------------------------------
// Dietary categories
// ---------------------------------------------------------------------------

/** "Tree Nuts!" becomes "tree-nuts". */
function keyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Enter a label.")
    .transform((label) => label.replace(/\s+/g, " "))
    .refine(
      (label) => keyFromLabel(label) !== "",
      "Use at least one letter or number.",
    ),
  kind: z.enum(["diet", "allergen"], { error: "Choose diet or allergen." }),
});

export async function saveCategory(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let duplicate = false;
  const result = await runAdminAction(
    categorySchema,
    formData,
    async ({ input, supabase }) => {
      const key = keyFromLabel(input.label);
      const existing = await supabase
        .from("dietary_categories")
        .select("key")
        .eq("key", key)
        .maybeSingle();
      if (existing.error) return { error: existing.error };
      if (existing.data) {
        duplicate = true;
        return;
      }
      const all = await supabase
        .from("dietary_categories")
        .select("display_order");
      if (all.error) return { error: all.error };
      const last = ((all.data ?? []) as { display_order: number | null }[])
        .map((row) => row.display_order ?? 0)
        .reduce((max, n) => Math.max(max, n), 0);
      const { error } = await supabase.from("dietary_categories").insert({
        key,
        label: input.label,
        kind: input.kind,
        display_order: last + 1,
      });
      return { error, revalidate: [MENUS_PATH] };
    },
  );
  if (duplicate) {
    return {
      ok: false,
      message: messageFor("invalid_request"),
      fieldErrors: { label: "A category with that name already exists." },
      values: formDataToObject(formData),
    };
  }
  return result;
}
