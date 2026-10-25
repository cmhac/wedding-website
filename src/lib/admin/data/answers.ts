import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  answeredByForMeal,
  answeredByForRsvp,
  type AnsweredBy,
  type MealHistoryEntry,
  type RsvpHistoryEntry,
  type StaffLookup,
} from "../attribution";
import { formatPacific } from "../time";

export type RsvpStatus = "pending" | "attending" | "declined";

/** One course of an event's menu, with this guest's choice for it. */
export type MealChoice = {
  courseId: string;
  courseName: string;
  /** Null when the guest has not chosen. */
  dishId: string | null;
  dishName: string | null;
  /** Who made this choice. Not answered when there is none. */
  answeredBy: AnsweredBy;
  /** Dishes staff can pick: archived dishes are left out. */
  options: { id: string; name: string }[];
};

/** One guest's invitation to one event, with who answered and the meals. */
export type AnswerRow = {
  guestId: string;
  guestName: string;
  eventId: string;
  eventName: string;
  status: RsvpStatus;
  answeredBy: AnsweredBy;
  /** Pacific time of the answer, or null when not answered. */
  answeredAt: string | null;
  meals: MealChoice[];
};

type Row = Record<string, unknown>;

async function clientOr(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? ((await createServerSupabase()) as SupabaseClient);
}

async function rpcRows(
  client: SupabaseClient,
  fn: "staff_guests" | "staff_households" | "staff_invitations",
): Promise<Row[]> {
  const { data, error } = await client.rpc(fn);
  if (error || !data) throw new Error(`${fn}_unreadable`);
  return data as Row[];
}

async function tableRows(
  client: SupabaseClient,
  table: string,
  column: string,
  values: string[],
): Promise<Row[]> {
  if (values.length === 0) return [];
  const { data, error } = await client
    .from(table)
    .select("*")
    .in(column, values);
  if (error || !data) throw new Error(`${table}_unreadable`);
  return data as Row[];
}

const byOrder = (a: Row, b: Row) =>
  Number(a.display_order ?? 0) - Number(b.display_order ?? 0);

/**
 * One row per guest per invited event for a household. Who answered comes
 * from the history tables and the staff list, never from the guest tables.
 * Staff names are read from `staff`. Throws if a read fails.
 */
export async function loadHouseholdAnswers(
  householdId: string,
  supabase?: SupabaseClient,
): Promise<AnswerRow[]> {
  const client = await clientOr(supabase);

  const [households, allGuests, allInvitations] = await Promise.all([
    rpcRows(client, "staff_households"),
    rpcRows(client, "staff_guests"),
    rpcRows(client, "staff_invitations"),
  ]);
  const household = households.find((h) => h.id === householdId);
  if (!household) return [];

  const guests = allGuests.filter((g) => g.household_id === householdId);
  const guestIds = guests.map((g) => g.id as string);
  const invitations = allInvitations.filter((i) =>
    guestIds.includes(i.guest_id as string),
  );
  if (invitations.length === 0) return [];
  const eventIds = [...new Set(invitations.map((i) => i.event_id as string))];

  const [events, rsvpHistory, selections, mealHistory, staffRows, menus] =
    await Promise.all([
      tableRows(client, "events", "id", eventIds),
      tableRows(client, "rsvp_history", "guest_id", guestIds),
      tableRows(client, "meal_selections", "guest_id", guestIds),
      tableRows(client, "meal_selection_history", "guest_id", guestIds),
      client.from("staff").select("user_id, display_name"),
      tableRows(client, "menus", "event_id", eventIds),
    ]);
  if (staffRows.error || !staffRows.data) throw new Error("staff_unreadable");
  const staff: StaffLookup = new Map(
    (staffRows.data as Row[]).map((s) => [
      s.user_id as string,
      s.display_name as string,
    ]),
  );

  const openMenus = menus.filter(
    (m) => m.status === "published" || m.status === "closed",
  );
  const menuByEvent = new Map(openMenus.map((m) => [m.event_id as string, m]));
  const courses = (
    await tableRows(
      client,
      "courses",
      "menu_id",
      openMenus.map((m) => m.id as string),
    )
  ).sort(byOrder);
  const dishes = await tableRows(
    client,
    "dishes",
    "course_id",
    courses.map((c) => c.id as string),
  );
  const dishName = new Map(
    dishes.map((d) => [d.id as string, d.name as string]),
  );

  const eventById = new Map(events.map((e) => [e.id as string, e]));
  const guestById = new Map(guests.map((g) => [g.id as string, g]));
  const authUserId = (household.auth_user_id as string | null) ?? null;

  const mealsFor = (guestId: string, eventId: string): MealChoice[] => {
    const menu = menuByEvent.get(eventId);
    if (!menu) return [];
    return courses
      .filter((c) => c.menu_id === menu.id)
      .map((course) => {
        const courseId = course.id as string;
        const dishId =
          (selections.find(
            (s) => s.guest_id === guestId && s.course_id === courseId,
          )?.dish_id as string | undefined) ?? null;
        return {
          courseId,
          courseName: course.name as string,
          dishId,
          dishName: dishId ? (dishName.get(dishId) ?? null) : null,
          answeredBy: answeredByForMeal({
            currentDishId: dishId,
            history: mealHistory.filter(
              (h) => h.guest_id === guestId && h.course_id === courseId,
            ) as unknown as MealHistoryEntry[],
            householdAuthUserId: authUserId,
            staff,
          }),
          options: dishes
            .filter((d) => d.course_id === courseId && !d.archived_at)
            .map((d) => ({ id: d.id as string, name: d.name as string })),
        };
      });
  };

  const fullName = (g: Row) =>
    [g.first_name, g.last_name].filter(Boolean).join(" ") || "Unnamed plus-one";

  const eventOrder = (i: Row) =>
    Number(eventById.get(i.event_id as string)!.display_order ?? 0);
  const guestLabel = (i: Row) => fullName(guestById.get(i.guest_id as string)!);

  return invitations
    .filter((i) => eventById.has(i.event_id as string))
    .sort(
      (a, b) =>
        eventOrder(a) - eventOrder(b) ||
        guestLabel(a).localeCompare(guestLabel(b)),
    )
    .map((i) => {
      const guestId = i.guest_id as string;
      const eventId = i.event_id as string;
      const status = i.status as RsvpStatus;
      const answeredBy = answeredByForRsvp({
        currentStatus: status,
        history: rsvpHistory.filter(
          (h) => h.guest_id === guestId && h.event_id === eventId,
        ) as unknown as RsvpHistoryEntry[],
        staff,
      });
      return {
        guestId,
        guestName: fullName(guestById.get(guestId)!),
        eventId,
        eventName: eventById.get(eventId)!.name as string,
        status,
        answeredBy,
        answeredAt: answeredBy.at ? formatPacific(answeredBy.at) : null,
        meals: mealsFor(guestId, eventId),
      };
    });
}
