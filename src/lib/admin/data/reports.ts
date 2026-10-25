import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answeredByForMeal,
  type AnsweredBy,
  type MealHistoryEntry,
  type StaffLookup,
} from "../attribution";

type Row = Record<string, unknown>;

export type DishTotalRow = {
  courseId: string;
  courseName: string;
  /** "Not yet chosen" for the row that counts attending guests with no dish. */
  dishName: string;
  chosenCount: number;
  notYetChosen: boolean;
};

export type DietaryRow = {
  guestId: string;
  guestName: string;
  householdName: string;
  /** The restriction's label, or null for a guest with only a free-text note. */
  restriction: string | null;
  severity: "allergy" | "preference" | null;
  notes: string | null;
};

export type MealConflictRow = {
  key: string;
  guestId: string;
  guestName: string;
  householdName: string;
  courseName: string;
  dishName: string;
  /** The restriction the dish clashes with, for example "Tree nuts". */
  conflictsWith: string;
  severity: "allergy" | "preference" | null;
  answeredBy: AnsweredBy;
};

async function read(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error("read_failed");
  return (data as Row[] | null) ?? [];
}

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const orNull = (value: unknown): string | null => {
  const s = text(value).trim();
  return s === "" ? null : s;
};
const severityOf = (value: unknown): "allergy" | "preference" | null =>
  value === "allergy" || value === "preference" ? value : null;

/** Dish totals for one event, by course order, "Not yet chosen" last in each. */
export async function loadDishTotals(
  supabase: SupabaseClient,
  eventSlug: string,
): Promise<DishTotalRow[]> {
  const rows = await read(
    supabase.from("dish_totals").select("*").eq("event_slug", eventSlug),
  );
  return rows
    .map((r) => ({
      order: Number(r.course_display_order ?? 0),
      row: {
        courseId: text(r.course_id),
        courseName: text(r.course_name),
        dishName:
          r.not_yet_chosen === true ? "Not yet chosen" : text(r.dish_name),
        chosenCount: Number(r.chosen_count ?? 0),
        notYetChosen: r.not_yet_chosen === true,
      } satisfies DishTotalRow,
    }))
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.row.courseId.localeCompare(b.row.courseId) ||
        Number(a.row.notYetChosen) - Number(b.row.notYetChosen) ||
        a.row.dishName.localeCompare(b.row.dishName),
    )
    .map((x) => x.row);
}

/** Attending guests with a restriction or a note, for one event. */
export async function loadDietaryList(
  supabase: SupabaseClient,
  eventSlug: string,
): Promise<DietaryRow[]> {
  const rows = await read(
    supabase
      .from("dietary_list")
      .select("*")
      .eq("event_slug", eventSlug)
      .order("guest_name"),
  );
  return rows.map((r) => ({
    guestId: text(r.guest_id),
    guestName: text(r.guest_name),
    householdName: text(r.household_name),
    restriction: orNull(r.category_label),
    severity: severityOf(r.severity),
    notes: orNull(r.details) ?? orNull(r.dietary_notes),
  }));
}

/** Chosen dishes that clash with a restriction, with who made each choice. */
export async function loadMealConflicts(
  supabase: SupabaseClient,
  eventSlug: string,
): Promise<MealConflictRow[]> {
  const conflicts = await read(
    supabase
      .from("meal_conflicts")
      .select("*")
      .eq("event_slug", eventSlug)
      .order("guest_name"),
  );
  if (conflicts.length === 0) return [];

  const guestIds = [...new Set(conflicts.map((c) => text(c.guest_id)))];
  const householdIds = [...new Set(conflicts.map((c) => text(c.household_id)))];
  const [categories, history, households, staffRows] = await Promise.all([
    read(supabase.from("dietary_categories").select("key, label")),
    read(
      supabase
        .from("meal_selection_history")
        .select(
          "id, guest_id, course_id, new_dish_id, actor_kind, changed_by, changed_at",
        )
        .in("guest_id", guestIds),
    ),
    read(
      supabase
        .from("households")
        .select("id, auth_user_id")
        .in("id", householdIds),
    ),
    read(supabase.from("staff").select("user_id, display_name")),
  ]);

  const labels = new Map(categories.map((c) => [text(c.key), text(c.label)]));
  const authByHousehold = new Map(
    households.map((h) => [text(h.id), orNull(h.auth_user_id)]),
  );
  const staff: StaffLookup = new Map(
    staffRows.map((s) => [text(s.user_id), text(s.display_name)]),
  );

  return conflicts.map((c) => {
    const entries: MealHistoryEntry[] = history
      .filter((h) => h.guest_id === c.guest_id && h.course_id === c.course_id)
      .map((h) => ({
        id: Number(h.id),
        actor_kind: (h.actor_kind as string | null) ?? null,
        changed_by: (h.changed_by as string | null) ?? null,
        changed_at: text(h.changed_at),
        new_dish_id: (h.new_dish_id as string | null) ?? null,
      }));
    const key = text(c.category_key);
    return {
      key: `${text(c.guest_id)}:${text(c.course_id)}:${key}`,
      guestId: text(c.guest_id),
      guestName: text(c.guest_name),
      householdName: text(c.household_name),
      courseName: text(c.course_name),
      dishName: text(c.dish_name),
      conflictsWith: labels.get(key) ?? key,
      severity: severityOf(c.severity),
      answeredBy: answeredByForMeal({
        currentDishId: text(c.dish_id),
        history: entries,
        householdAuthUserId: authByHousehold.get(text(c.household_id)) ?? null,
        staff,
      }),
    };
  });
}

/** Events for the report picker, in display order. */
export async function loadEventOptions(
  supabase: SupabaseClient,
): Promise<{ slug: string; name: string }[]> {
  const rows = await read(
    supabase
      .from("events")
      .select("slug, name, display_order")
      .order("display_order")
      .order("name"),
  );
  return rows.map((r) => ({ slug: text(r.slug), name: text(r.name) }));
}
