import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export type MenuStatus = "draft" | "published" | "closed";
export type DietaryKind = "diet" | "allergen";

export type MenuEvent = { id: string; slug: string; name: string };

export type DietaryCategory = {
  key: string;
  label: string;
  kind: DietaryKind;
  displayOrder: number | null;
};

export type DishTag = {
  key: string;
  label: string;
  kind: DietaryKind;
  /** A diet tag means the dish is suitable for it; an allergen tag, that it contains it. */
  meaning: "suitable for" | "contains";
};

export type DishView = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  tags: DishTag[];
  chosenCount: number;
};

export type CourseView = {
  id: string;
  name: string;
  displayOrder: number | null;
  requiresChoice: boolean;
  dishes: DishView[];
};

export type MenuView = {
  id: string;
  status: MenuStatus;
  courses: CourseView[];
};

/**
 * `menu` is null when the event has no menu yet; `hasMenu` is the flag the
 * screen uses to offer to create one.
 */
export type MenuLoad = {
  event: MenuEvent;
  menu: MenuView | null;
  hasMenu: boolean;
};

type Row = Record<string, unknown>;

async function client(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? ((await createServerSupabase()) as SupabaseClient);
}

function failed(error: unknown): never {
  // The caller's error boundary shows the generic message; no details leak.
  throw new Error("menu_load_failed", { cause: error });
}

function byOrderThenName(
  a: { displayOrder: number | null; name: string },
  b: { displayOrder: number | null; name: string },
): number {
  const x = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const y = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
  return x - y || a.name.localeCompare(b.name);
}

function toCategory(row: Row): DietaryCategory {
  return {
    key: row.key as string,
    label: row.label as string,
    kind: row.kind as DietaryKind,
    displayOrder: (row.display_order as number | null) ?? null,
  };
}

/** Events for the menu screen's event select, in display order. */
export async function loadMenuEvents(
  supabase?: SupabaseClient,
): Promise<MenuEvent[]> {
  const db = await client(supabase);
  const { data, error } = await db
    .from("events")
    .select("id, slug, name, display_order")
    .order("display_order", { nullsFirst: false })
    .order("starts_at");
  if (error) failed(error);
  return ((data ?? []) as Row[]).map((e) => ({
    id: e.id as string,
    slug: e.slug as string,
    name: e.name as string,
  }));
}

/** The dietary vocabulary, shared by dish tags and guest restrictions. */
export async function loadDietaryCategories(
  supabase?: SupabaseClient,
): Promise<DietaryCategory[]> {
  const db = await client(supabase);
  const { data, error } = await db
    .from("dietary_categories")
    .select("key, label, kind, display_order")
    .order("display_order", { nullsFirst: false })
    .order("label");
  if (error) failed(error);
  return ((data ?? []) as Row[]).map(toCategory);
}

/** One event's menu with courses, dishes, tags and chosen counts; null for an unknown event. */
export async function loadMenu(
  eventSlug: string,
  supabase?: SupabaseClient,
): Promise<MenuLoad | null> {
  const db = await client(supabase);

  const eventRes = await db
    .from("events")
    .select("id, slug, name")
    .eq("slug", eventSlug)
    .maybeSingle();
  if (eventRes.error) failed(eventRes.error);
  if (!eventRes.data) return null;
  const eventRow = eventRes.data as Row;
  const event: MenuEvent = {
    id: eventRow.id as string,
    slug: eventRow.slug as string,
    name: eventRow.name as string,
  };

  const menuRes = await db
    .from("menus")
    .select("id, status")
    .eq("event_id", event.id)
    .maybeSingle();
  if (menuRes.error) failed(menuRes.error);
  if (!menuRes.data) return { event, menu: null, hasMenu: false };
  const menuRow = menuRes.data as Row;
  const menuId = menuRow.id as string;

  const courseRes = await db
    .from("courses")
    .select("id, name, display_order, requires_choice")
    .eq("menu_id", menuId)
    .order("display_order", { nullsFirst: false });
  if (courseRes.error) failed(courseRes.error);
  const courseRows = (courseRes.data ?? []) as Row[];
  const courseIds = courseRows.map((c) => c.id as string);

  const dishRows: Row[] = [];
  if (courseIds.length > 0) {
    const res = await db
      .from("dishes")
      .select("id, course_id, name, description, archived_at")
      .in("course_id", courseIds)
      .order("name");
    if (res.error) failed(res.error);
    dishRows.push(...((res.data ?? []) as Row[]));
  }

  const dishIds = dishRows.map((d) => d.id as string);
  const tagRows: Row[] = [];
  if (dishIds.length > 0) {
    const res = await db
      .from("dish_tags")
      .select("dish_id, category_key")
      .in("dish_id", dishIds);
    if (res.error) failed(res.error);
    tagRows.push(...((res.data ?? []) as Row[]));
  }

  const categories = await loadDietaryCategories(db);
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));

  const totalsRes = await db
    .from("dish_totals")
    .select("course_id, dish_id, chosen_count, not_yet_chosen")
    .eq("event_id", event.id);
  if (totalsRes.error) failed(totalsRes.error);
  const chosen = new Map<string, number>();
  for (const t of (totalsRes.data ?? []) as Row[]) {
    if (t.not_yet_chosen === false && typeof t.dish_id === "string") {
      chosen.set(t.dish_id, Number(t.chosen_count) || 0);
    }
  }

  const tagsByDish = new Map<string, DishTag[]>();
  for (const t of tagRows) {
    const category = categoryByKey.get(t.category_key as string);
    if (!category) continue;
    const list = tagsByDish.get(t.dish_id as string) ?? [];
    list.push({
      key: category.key,
      label: category.label,
      kind: category.kind,
      meaning: category.kind === "diet" ? "suitable for" : "contains",
    });
    tagsByDish.set(t.dish_id as string, list);
  }
  const categoryOrder = new Map(categories.map((c, i) => [c.key, i]));

  const courses: CourseView[] = courseRows
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      displayOrder: (c.display_order as number | null) ?? null,
      requiresChoice: c.requires_choice !== false,
      dishes: dishRows
        .filter((d) => d.course_id === c.id)
        .map((d) => ({
          id: d.id as string,
          name: d.name as string,
          description: (d.description as string | null) ?? null,
          archivedAt: (d.archived_at as string | null) ?? null,
          tags: (tagsByDish.get(d.id as string) ?? []).sort(
            (a, b) =>
              (categoryOrder.get(a.key) ?? 0) - (categoryOrder.get(b.key) ?? 0),
          ),
          chosenCount: chosen.get(d.id as string) ?? 0,
        })),
    }))
    .sort(byOrderThenName);

  return {
    event,
    hasMenu: true,
    menu: { id: menuId, status: menuRow.status as MenuStatus, courses },
  };
}
