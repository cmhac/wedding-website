import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";

export type OverviewEvent = {
  id: string;
  slug: string;
  name: string;
  isRequired: boolean;
  invited: number;
  attending: number;
  declined: number;
  pending: number;
};

export type OutstandingHousehold = {
  householdId: string;
  name: string;
  required: number;
  optional: number;
  meals: number;
};

export type OverviewData = {
  householdCount: number;
  /** The ceremony's headcount, or null when there is no such event. */
  ceremony: { attending: number; invited: number } | null;
  /** In display order. */
  events: OverviewEvent[];
  /** Households, not answers. */
  requiredOutstanding: number;
  optionalOutstanding: number;
  mealsOutstanding: number;
  deliveryProblems: number;
  paperOnly: number;
  possibleDuplicates: number;
  /** Top three by total outstanding; households with nothing outstanding are left out. */
  mostOutstanding: OutstandingHousehold[];
  rsvpOpen: boolean;
  defaultDeadline: string | null;
};

const MOST_OUTSTANDING_LIMIT = 3;
const CEREMONY_SLUG = "ceremony";

type Row = Record<string, unknown>;

function fail(source: string): never {
  // Only the name of the failing read is logged, never database text.
  log.error("overview_read_failed", { code: source });
  throw new Error("overview_load_failed");
}

async function rows(
  source: string,
  query: PromiseLike<{ data: unknown; error: unknown }>,
) {
  const { data, error } = await query;
  if (error) fail(source);
  return (data ?? []) as Row[];
}

const num = (value: unknown) => Number(value ?? 0);

/** Everything the overview page shows, read as the signed-in staff member. */
export async function loadOverview(
  supabase: SupabaseClient,
): Promise<OverviewData> {
  const [
    eventRows,
    countRows,
    progressRows,
    householdRows,
    duplicateRows,
    settingsRows,
  ] = await Promise.all([
    rows(
      "events",
      supabase
        .from("events")
        .select("id, slug, name, is_required, display_order")
        .order("display_order", { ascending: true }),
    ),
    rows(
      "event_counts",
      supabase
        .from("event_counts")
        .select("event_id, slug, name, invited, attending, declined, pending"),
    ),
    rows(
      "household_rsvp_progress",
      supabase
        .from("household_rsvp_progress")
        .select(
          "household_id, display_name, pending_required, pending_optional, pending_meals",
        ),
    ),
    rows("staff_households", supabase.rpc("staff_households")),
    rows(
      "find_duplicate_households",
      supabase.rpc("find_duplicate_households"),
    ),
    rows(
      "settings",
      supabase.from("settings").select("rsvp_open, default_rsvp_deadline"),
    ),
  ]);

  const countsByEvent = new Map(
    countRows.map((c) => [c.event_id as string, c]),
  );
  const events: OverviewEvent[] = eventRows.map((e) => {
    const c = countsByEvent.get(e.id as string);
    return {
      id: e.id as string,
      slug: e.slug as string,
      name: e.name as string,
      isRequired: Boolean(e.is_required),
      invited: num(c?.invited),
      attending: num(c?.attending),
      declined: num(c?.declined),
      pending: num(c?.pending),
    };
  });

  const ceremonyEvent =
    events.find((e) => e.slug === CEREMONY_SLUG) ??
    events.find((e) => e.isRequired);

  const outstanding: OutstandingHousehold[] = progressRows.map((p) => ({
    householdId: p.household_id as string,
    name: p.display_name as string,
    required: num(p.pending_required),
    optional: num(p.pending_optional),
    meals: num(p.pending_meals),
  }));
  const total = (h: OutstandingHousehold) => h.required + h.optional + h.meals;
  const mostOutstanding = outstanding
    .filter((h) => total(h) > 0)
    .sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name))
    .slice(0, MOST_OUTSTANDING_LIMIT);

  const settings = settingsRows[0];

  return {
    householdCount: householdRows.length,
    ceremony: ceremonyEvent
      ? { attending: ceremonyEvent.attending, invited: ceremonyEvent.invited }
      : null,
    events,
    requiredOutstanding: outstanding.filter((h) => h.required > 0).length,
    optionalOutstanding: outstanding.filter((h) => h.optional > 0).length,
    mealsOutstanding: outstanding.filter((h) => h.meals > 0).length,
    deliveryProblems: householdRows.filter((h) => h.delivery_problem === true)
      .length,
    paperOnly: householdRows.filter((h) => !h.contact_email).length,
    possibleDuplicates: duplicateRows.length,
    mostOutstanding,
    rsvpOpen: settings ? settings.rsvp_open !== false : true,
    defaultDeadline: (settings?.default_rsvp_deadline as string | null) ?? null,
  };
}
