import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatPacific, isoToPacificLocal } from "../time";

/** One event, shaped for the events list and the event form. */
export type EventRow = {
  id: string;
  slug: string;
  name: string;
  /** "" when not set. */
  venue: string;
  isRequired: boolean;
  /** "" when not set. */
  groupKey: string;
  displayOrder: number;
  /** Households' guests invited (from `event_counts`). */
  invited: number;
  /** Pacific text such as "Sat, Jun 12, 4:00 PM PT", or "" when not set. */
  startsAtText: string;
  /** A Pacific `datetime-local` value, or "". */
  startsAtLocal: string;
  /** "Default" when the event has no deadline of its own. */
  deadlineText: string;
  /** A Pacific `datetime-local` value, or "". */
  deadlineLocal: string;
};

/** A guest in the invite picker. */
export type InvitableGuest = {
  id: string;
  name: string;
  householdName: string;
  /** The guest's current invitation to the chosen event, or null. */
  invitation: { status: string } | null;
};

type Row = Record<string, unknown>;

async function clientOr(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? ((await createServerSupabase()) as SupabaseClient);
}

function toEventRow(row: Row, invited: number): EventRow {
  const startsAt = (row.starts_at as string | null) ?? null;
  const deadline = (row.rsvp_deadline as string | null) ?? null;
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    venue: (row.venue_name as string | null) ?? "",
    isRequired: Boolean(row.is_required),
    groupKey: (row.group_key as string | null) ?? "",
    displayOrder: Number(row.display_order ?? 0),
    invited,
    startsAtText: startsAt
      ? formatPacific(startsAt, { weekday: true, time: true })
      : "",
    startsAtLocal: isoToPacificLocal(startsAt),
    deadlineText: deadline ? formatPacific(deadline) : "Default",
    deadlineLocal: isoToPacificLocal(deadline),
  };
}

async function invitedCounts(
  client: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await client
    .from("event_counts")
    .select("event_id, invited");
  if (error || !data) throw new Error("event_counts_unreadable");
  return new Map(
    (data as Row[]).map((r) => [r.event_id as string, Number(r.invited ?? 0)]),
  );
}

/** Every event in display order. Throws if unreadable. */
export async function loadEvents(
  supabase?: SupabaseClient,
): Promise<EventRow[]> {
  const client = await clientOr(supabase);
  const { data, error } = await client
    .from("events")
    .select("*")
    .order("display_order", { ascending: true });
  if (error || !data) throw new Error("events_unreadable");
  const counts = await invitedCounts(client);
  return (data as Row[]).map((row) =>
    toEventRow(row, counts.get(row.id as string) ?? 0),
  );
}

/** One event, or null when there is no such event. */
export async function loadEvent(
  id: string,
  supabase?: SupabaseClient,
): Promise<EventRow | null> {
  const client = await clientOr(supabase);
  const { data, error } = await client
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("events_unreadable");
  if (!data) return null;
  const counts = await invitedCounts(client);
  return toEventRow(data as Row, counts.get(id) ?? 0);
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function rows(
  client: SupabaseClient,
  fn: "staff_guests" | "staff_households" | "staff_invitations",
): Promise<Row[]> {
  const { data, error } = await client.rpc(fn);
  if (error || !data) throw new Error(`${fn}_unreadable`);
  return data as Row[];
}

/**
 * Guests for the invite picker, with their household names. `q` matches a
 * guest's or household's name, ignoring capitals and accents. With an event
 * chosen, each guest says whether they already have an invitation to it.
 */
export async function loadInvitableGuests(
  q: string,
  eventId?: string,
  supabase?: SupabaseClient,
): Promise<InvitableGuest[]> {
  const client = await clientOr(supabase);
  const [guests, households, invitations] = await Promise.all([
    rows(client, "staff_guests"),
    rows(client, "staff_households"),
    eventId ? rows(client, "staff_invitations") : Promise.resolve([]),
  ]);
  const householdNames = new Map(
    households.map((h) => [h.id as string, (h.display_name as string) ?? ""]),
  );
  const invited = new Map(
    invitations
      .filter((i) => i.event_id === eventId)
      .map((i) => [i.guest_id as string, i.status as string]),
  );
  const needle = fold(q.trim());

  return guests
    .map((g) => {
      const full = [g.first_name, g.last_name].filter(Boolean).join(" ");
      const status = invited.get(g.id as string);
      return {
        id: g.id as string,
        name: full || "Unnamed plus-one",
        householdName: householdNames.get(g.household_id as string) ?? "",
        invitation: status === undefined ? null : { status },
      };
    })
    .filter(
      (g) =>
        !needle ||
        fold(g.name).includes(needle) ||
        fold(g.householdName).includes(needle),
    )
    .sort(
      (a, b) =>
        a.householdName.localeCompare(b.householdName) ||
        a.name.localeCompare(b.name),
    );
}
