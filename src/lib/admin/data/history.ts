import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answeredByForMeal,
  answeredByForRsvp,
  type AnsweredBy,
  type StaffLookup,
} from "../attribution";
import { pacificLocalToIso } from "../time";

type Row = Record<string, unknown>;

export const HISTORY_PAGE_SIZE = 50;

export type HistoryFilters = {
  /** A Pacific calendar day, "2026-10-25", or "" for no lower bound. */
  from: string;
  /** A Pacific calendar day, inclusive, or "" for no upper bound. */
  to: string;
  /** "anyone", "guest", "system" or a staff user id. */
  by: string;
  /** 1-based. */
  page: number;
};

export type HistoryPage<T> = { rows: T[]; page: number; hasMore: boolean };

export type ChangeLogRow = {
  id: number;
  at: string;
  who: string;
  entity: string;
  action: string;
  /** Field names in words. Values are never read or shown. */
  fieldsChanged: string;
};

export type RsvpHistoryRow = {
  id: number;
  at: string;
  guestName: string;
  eventName: string;
  change: string;
  answeredBy: AnsweredBy;
};

export type MealHistoryRow = {
  id: number;
  at: string;
  guestName: string;
  courseName: string;
  from: string;
  to: string;
  reason: string;
  answeredBy: AnsweredBy;
};

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const idOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

async function read(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error("read_failed");
  return (data as Row[] | null) ?? [];
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(day: string): string | null {
  if (!DAY_PATTERN.test(day)) return null;
  const iso = pacificLocalToIso(`${day}T00:00`);
  return typeof iso === "string" ? iso : null;
}

function startOfNextDay(day: string): string | null {
  if (!DAY_PATTERN.test(day)) return null;
  const next = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) return null;
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfDay(next.toISOString().slice(0, 10));
}

/**
 * The shared part of every history read: date range (Pacific days, `to`
 * inclusive), who made the change, newest first, one page plus one row to
 * tell whether there is a next page.
 */
function filtered(
  supabase: SupabaseClient,
  table: string,
  columns: { at: string; user: string; kind: string },
  filters: HistoryFilters,
) {
  const page = Math.max(1, Math.floor(filters.page) || 1);
  let query = supabase.from(table).select("*");
  const start = startOfDay(filters.from);
  if (start) query = query.gte(columns.at, start);
  const end = startOfNextDay(filters.to);
  if (end) query = query.lt(columns.at, end);
  if (filters.by === "guest" || filters.by === "system") {
    query = query.eq(columns.kind, filters.by);
  } else if (filters.by && filters.by !== "anyone") {
    query = query.eq(columns.user, filters.by);
  }
  const offset = (page - 1) * HISTORY_PAGE_SIZE;
  return {
    page,
    query: query
      .order(columns.at, { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + HISTORY_PAGE_SIZE),
  };
}

function paged<T>(rows: T[], page: number): HistoryPage<T> {
  return {
    rows: rows.slice(0, HISTORY_PAGE_SIZE),
    page,
    hasMore: rows.length > HISTORY_PAGE_SIZE,
  };
}

async function loadStaff(
  supabase: SupabaseClient,
): Promise<{ names: StaffLookup; roles: Map<string, string> }> {
  const rows = await read(
    supabase.from("staff").select("user_id, display_name, role"),
  );
  return {
    names: new Map(rows.map((s) => [text(s.user_id), text(s.display_name)])),
    roles: new Map(rows.map((s) => [text(s.user_id), text(s.role)])),
  };
}

async function namesById(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: (string | null)[],
): Promise<Map<string, Row>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const rows = await read(
    supabase.from(table).select(columns).in("id", unique),
  );
  return new Map(rows.map((r) => [text(r.id), r]));
}

const guestName = (guest: Row | undefined): string =>
  guest
    ? [text(guest.first_name), text(guest.last_name)]
        .filter(Boolean)
        .join(" ")
        .trim() || "Unnamed guest"
    : "Removed guest";

const ENTITY_LABELS: Record<string, string> = {
  households: "Household",
  guests: "Guest",
  invitations: "Invitation",
  events: "Event",
  staff: "Staff member",
  menus: "Menu",
  guest_dietary: "Dietary restriction",
  meal_selections: "Meal choice",
  campaigns: "Campaign",
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Add",
  update: "Update",
  delete: "Delete",
};

function sentenceCase(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldWords(fields: unknown): string {
  if (!Array.isArray(fields)) return "";
  return fields
    .map((f) =>
      String(f)
        .replace(/plus_one/g, "plus-one")
        .replace(/_/g, " "),
    )
    .join(", ");
}

/** The audit log, newest first. Shows which fields changed, never values. */
export async function loadChangeLog(
  supabase: SupabaseClient,
  filters: HistoryFilters,
): Promise<HistoryPage<ChangeLogRow>> {
  const { page, query } = filtered(
    supabase,
    "audit_log",
    { at: "at", user: "actor_user_id", kind: "actor_kind" },
    filters,
  );
  const [rows, staff] = await Promise.all([read(query), loadStaff(supabase)]);

  const whoIs = (row: Row): string => {
    const kind = text(row.actor_kind);
    if (kind === "guest") return "Guest";
    if (kind === "system") return "System";
    const user = idOrNull(row.actor_user_id);
    const name = user ? staff.names.get(user) : undefined;
    return name ? `${name} (${kind})` : `${sentenceCase(kind)} (former member)`;
  };

  return paged(
    rows.map((r) => ({
      id: Number(r.id),
      at: text(r.at),
      who: whoIs(r),
      entity: ENTITY_LABELS[text(r.entity)] ?? sentenceCase(text(r.entity)),
      action: ACTION_LABELS[text(r.action)] ?? sentenceCase(text(r.action)),
      fieldsChanged: fieldWords(r.changed_fields),
    })),
    page,
  );
}

/** Every RSVP status change, newest first, with who made it. */
export async function loadRsvpHistory(
  supabase: SupabaseClient,
  filters: HistoryFilters,
): Promise<HistoryPage<RsvpHistoryRow>> {
  const { page, query } = filtered(
    supabase,
    "rsvp_history",
    { at: "changed_at", user: "changed_by", kind: "actor_kind" },
    filters,
  );
  const [rows, staff] = await Promise.all([read(query), loadStaff(supabase)]);
  const [guests, events] = await Promise.all([
    namesById(
      supabase,
      "guests",
      "id, first_name, last_name",
      rows.map((r) => idOrNull(r.guest_id)),
    ),
    namesById(
      supabase,
      "events",
      "id, name",
      rows.map((r) => idOrNull(r.event_id)),
    ),
  ]);

  return paged(
    rows.map((r) => {
      const guestId = idOrNull(r.guest_id);
      const eventId = idOrNull(r.event_id);
      const newStatus = text(r.new_status);
      return {
        id: Number(r.id),
        at: text(r.changed_at),
        guestName: guestName(guestId ? guests.get(guestId) : undefined),
        eventName: eventId
          ? text(events.get(eventId)?.name) || "Removed event"
          : "Removed event",
        change: `${sentenceCase(text(r.old_status) || "pending")} to ${sentenceCase(newStatus)}`,
        answeredBy: answeredByForRsvp({
          currentStatus: newStatus,
          history: [
            {
              id: Number(r.id),
              actor_kind: (r.actor_kind as string | null) ?? null,
              changed_by: idOrNull(r.changed_by),
              changed_at: text(r.changed_at),
              new_status: newStatus,
            },
          ],
          staff: staff.names,
        }),
      };
    }),
    page,
  );
}

const MEAL_REASONS: Record<string, string> = {
  changed: "Changed",
  declined: "Declined",
  dish_archived: "Dish archived",
};

// answeredByForMeal treats an empty current dish as "not answered", but a
// history row that cleared a choice still has a person behind it.
const NO_DISH = "none";

/** Every meal choice change, newest first, with who made it. */
export async function loadMealHistory(
  supabase: SupabaseClient,
  filters: HistoryFilters,
): Promise<HistoryPage<MealHistoryRow>> {
  const { page, query } = filtered(
    supabase,
    "meal_selection_history",
    { at: "changed_at", user: "changed_by", kind: "actor_kind" },
    filters,
  );
  const [rows, staff] = await Promise.all([read(query), loadStaff(supabase)]);
  const [guests, courses, dishes] = await Promise.all([
    namesById(
      supabase,
      "guests",
      "id, first_name, last_name, household_id",
      rows.map((r) => idOrNull(r.guest_id)),
    ),
    namesById(
      supabase,
      "courses",
      "id, name",
      rows.map((r) => idOrNull(r.course_id)),
    ),
    namesById(
      supabase,
      "dishes",
      "id, name",
      rows.flatMap((r) => [idOrNull(r.old_dish_id), idOrNull(r.new_dish_id)]),
    ),
  ]);
  const households = await namesById(
    supabase,
    "households",
    "id, auth_user_id",
    [...guests.values()].map((g) => idOrNull(g.household_id)),
  );

  const dishName = (id: string | null) =>
    id ? text(dishes.get(id)?.name) || "Removed dish" : "None";

  return paged(
    rows.map((r) => {
      const guestId = idOrNull(r.guest_id);
      const guest = guestId ? guests.get(guestId) : undefined;
      const household = guest
        ? households.get(text(guest.household_id))
        : undefined;
      const newDish = idOrNull(r.new_dish_id);
      const courseId = idOrNull(r.course_id);
      return {
        id: Number(r.id),
        at: text(r.changed_at),
        guestName: guestName(guest),
        courseName: courseId
          ? text(courses.get(courseId)?.name) || "Removed course"
          : "Removed course",
        from: dishName(idOrNull(r.old_dish_id)),
        to: dishName(newDish),
        reason: MEAL_REASONS[text(r.reason)] ?? sentenceCase(text(r.reason)),
        answeredBy: answeredByForMeal({
          currentDishId: newDish ?? NO_DISH,
          history: [
            {
              id: Number(r.id),
              actor_kind: (r.actor_kind as string | null) ?? null,
              changed_by: idOrNull(r.changed_by),
              changed_at: text(r.changed_at),
              new_dish_id: newDish ?? NO_DISH,
            },
          ],
          householdAuthUserId: household
            ? idOrNull(household.auth_user_id)
            : null,
          staff: staff.names,
        }),
      };
    }),
    page,
  );
}

/** Staff for the "Changed by" filter, by name. */
export async function loadStaffOptions(
  supabase: SupabaseClient,
): Promise<{ id: string; label: string }[]> {
  const { names } = await loadStaff(supabase);
  return [...names.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
