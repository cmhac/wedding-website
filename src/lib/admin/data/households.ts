import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { createServerSupabase } from "@/lib/supabase/server";

// Household reads for the admin console. Reads of households, guests and
// invitations name their columns or use the staff_* functions: the database
// refuses `select *` on those tables.

export const PAGE_SIZE = 25;

export const SHOW_VALUES = [
  "everyone",
  "required",
  "optional",
  "meals",
  "delivery_problem",
  "paper_only",
] as const;
export type ShowFilter = (typeof SHOW_VALUES)[number];

export type HouseholdQuery = {
  q: string;
  /** An event slug, or empty for any event. */
  invited: string;
  show: ShowFilter;
  page: number;
};

export type HouseholdRow = {
  id: string;
  displayName: string;
  /** Named guests only. */
  guestNames: string[];
  /** Unnamed plus-one seats. */
  unnamedSeats: number;
  contactEmail: string | null;
  plusOnesAllowed: number;
  plusOnesNamed: number;
  outstanding: { required: number; optional: number; meals: number };
  deliveryProblem: boolean;
  paperOnly: boolean;
  possibleDuplicate: boolean;
};

export type HouseholdList = {
  rows: HouseholdRow[];
  /** Households matching the search and filters. */
  total: number;
  /** All households. */
  totalAll: number;
  totalGuests: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export type DuplicatePair = {
  a: { id: string; displayName: string };
  b: { id: string; displayName: string };
  reason: string;
};

export type DietaryEntry = {
  categoryKey: string;
  label: string;
  severity: "allergy" | "preference";
  details: string | null;
};

export type GuestDetail = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isPlaceholder: boolean;
  isPlusOne: boolean;
  dietaryNotes: string | null;
  notes: string | null;
  dietary: DietaryEntry[];
};

export type HouseholdAddress = {
  street?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
};

export type HouseholdDetail = {
  id: string;
  displayName: string;
  contactEmail: string | null;
  plusOneAllowance: number;
  address: HouseholdAddress | null;
  notes: string | null;
  messageToCouple: string | null;
  rsvpDeadlineOverride: string | null;
  remindersOptOut: boolean;
  deliveryProblem: boolean;
  /** The deadline used when the household has no override of its own. */
  defaultDeadline: string | null;
  guests: GuestDetail[];
  dietaryCategories: { key: string; label: string }[];
};

type Row = Record<string, unknown>;

function fail(source: string): never {
  // Only the name of the failing read is logged, never database text.
  log.error("household_read_failed", { code: source });
  throw new Error("household_load_failed");
}

async function rows(
  source: string,
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) fail(source);
  return (data ?? []) as Row[];
}

async function client(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? ((await createServerSupabase()) as SupabaseClient);
}

/** Lowercase, accents removed, trimmed: what the search compares. */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

type SearchParams = Record<string, string | string[] | undefined>;

const firstValue = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Reads the list page's query values, falling back to safe defaults. */
export function parseHouseholdQuery(params: SearchParams): {
  query: HouseholdQuery;
  duplicates: boolean;
} {
  const show = firstValue(params.show);
  const page = Number.parseInt(firstValue(params.page), 10);
  return {
    query: {
      q: firstValue(params.q).trim(),
      invited: firstValue(params.invited).trim(),
      show: (SHOW_VALUES as readonly string[]).includes(show)
        ? (show as ShowFilter)
        : "everyone",
      page: Number.isFinite(page) && page >= 1 ? page : 1,
    },
    duplicates: firstValue(params.view) === "duplicates",
  };
}

const byName = (a: string, b: string) =>
  a.localeCompare(b, "en", { sensitivity: "base" });

const num = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => (value == null ? null : String(value));

function fullName(guest: Row): string | null {
  if (guest.is_placeholder) return null;
  return [guest.first_name, guest.last_name].filter(Boolean).join(" ") || null;
}

const REASONS: Record<string, string> = {
  display_name: "Same name once spacing and capitals are ignored",
  address: "Same address",
};

function reasonText(reasons: unknown): string {
  const list = Array.isArray(reasons) ? (reasons as string[]) : [];
  return list.map((r) => REASONS[r] ?? "Looks the same").join("; ");
}

export async function loadHouseholdList(
  query: HouseholdQuery,
  supabase?: SupabaseClient,
): Promise<HouseholdList> {
  const db = await client(supabase);
  const needInvitations = query.invited !== "";
  const [households, guests, progress, duplicates, eventRows, invitations] =
    await Promise.all([
      rows("staff_households", db.rpc("staff_households")),
      rows("staff_guests", db.rpc("staff_guests")),
      rows(
        "household_rsvp_progress",
        db
          .from("household_rsvp_progress")
          .select(
            "household_id, pending_required, pending_optional, pending_meals",
          ),
      ),
      rows("find_duplicate_households", db.rpc("find_duplicate_households")),
      needInvitations
        ? rows("events", db.from("events").select("id, slug"))
        : Promise.resolve([] as Row[]),
      needInvitations
        ? rows("staff_invitations", db.rpc("staff_invitations"))
        : Promise.resolve([] as Row[]),
    ]);

  const guestsByHousehold = new Map<string, Row[]>();
  for (const g of guests) {
    const key = g.household_id as string;
    const list = guestsByHousehold.get(key) ?? [];
    list.push(g);
    guestsByHousehold.set(key, list);
  }
  const progressByHousehold = new Map(
    progress.map((p) => [p.household_id as string, p]),
  );
  const duplicateIds = new Set<string>();
  for (const pair of duplicates) {
    duplicateIds.add(pair.household_a as string);
    duplicateIds.add(pair.household_b as string);
  }

  let invitedHouseholds: Set<string> | null = null;
  if (needInvitations) {
    const event = eventRows.find((e) => e.slug === query.invited);
    const guestHousehold = new Map(
      guests.map((g) => [g.id as string, g.household_id as string]),
    );
    invitedHouseholds = new Set(
      event
        ? invitations
            .filter((i) => i.event_id === event.id)
            .map((i) => guestHousehold.get(i.guest_id as string))
            .filter((id): id is string => Boolean(id))
        : [],
    );
  }

  const built: HouseholdRow[] = households.map((h) => {
    const id = h.id as string;
    const members = guestsByHousehold.get(id) ?? [];
    const p = progressByHousehold.get(id);
    const contactEmail = text(h.contact_email) || null;
    return {
      id,
      displayName: h.display_name as string,
      guestNames: members.map(fullName).filter((n): n is string => n !== null),
      unnamedSeats: members.filter((g) => g.is_placeholder).length,
      contactEmail,
      plusOnesAllowed: num(h.plus_one_allowance),
      plusOnesNamed: members.filter((g) => g.is_plus_one && !g.is_placeholder)
        .length,
      outstanding: {
        required: num(p?.pending_required),
        optional: num(p?.pending_optional),
        meals: num(p?.pending_meals),
      },
      deliveryProblem: Boolean(h.delivery_problem),
      paperOnly: contactEmail === null,
      possibleDuplicate: duplicateIds.has(id),
    };
  });

  const needle = normalizeForSearch(query.q);
  const show = (SHOW_VALUES as readonly string[]).includes(query.show)
    ? query.show
    : "everyone";
  const matches = built
    .filter((row) => {
      if (needle) {
        const haystack = [row.displayName, ...row.guestNames].map(
          normalizeForSearch,
        );
        if (!haystack.some((value) => value.includes(needle))) return false;
      }
      if (invitedHouseholds && !invitedHouseholds.has(row.id)) return false;
      switch (show) {
        case "required":
          return row.outstanding.required > 0;
        case "optional":
          return row.outstanding.optional > 0;
        case "meals":
          return row.outstanding.meals > 0;
        case "delivery_problem":
          return row.deliveryProblem;
        case "paper_only":
          return row.paperOnly;
        default:
          return true;
      }
    })
    .sort((a, b) => byName(a.displayName, b.displayName));

  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(query.page) || 1), pageCount);
  return {
    rows: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: matches.length,
    totalAll: built.length,
    totalGuests: guests.length,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
  };
}

export async function loadDuplicates(
  supabase?: SupabaseClient,
): Promise<DuplicatePair[]> {
  const db = await client(supabase);
  const [pairs, households] = await Promise.all([
    rows("find_duplicate_households", db.rpc("find_duplicate_households")),
    rows("staff_households", db.rpc("staff_households")),
  ]);
  const nameOf = new Map(
    households.map((h) => [h.id as string, h.display_name as string]),
  );
  const entry = (id: string) => ({
    id,
    displayName: nameOf.get(id) ?? "Unknown household",
  });
  return pairs.map((p) => ({
    a: entry(p.household_a as string),
    b: entry(p.household_b as string),
    reason: reasonText(p.reasons),
  }));
}

function asAddress(value: unknown): HouseholdAddress | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as HouseholdAddress)
    : null;
}

export async function loadHouseholdDetail(
  id: string,
  supabase?: SupabaseClient,
): Promise<HouseholdDetail | null> {
  const db = await client(supabase);
  const [households, guests, categories, dietary, settings] = await Promise.all(
    [
      rows("staff_households", db.rpc("staff_households")),
      rows("staff_guests", db.rpc("staff_guests")),
      rows(
        "dietary_categories",
        db
          .from("dietary_categories")
          .select("key, label, display_order")
          .order("display_order", { ascending: true }),
      ),
      rows(
        "guest_dietary",
        db
          .from("guest_dietary")
          .select("guest_id, category_key, severity, details"),
      ),
      rows("settings", db.from("settings").select("default_rsvp_deadline")),
    ],
  );

  const h = households.find((row) => row.id === id);
  if (!h) return null;

  const labelOf = new Map(
    categories.map((c) => [c.key as string, c.label as string]),
  );
  const members = guests.filter((g) => g.household_id === id);
  const memberIds = new Set(members.map((g) => g.id as string));
  const entriesByGuest = new Map<string, DietaryEntry[]>();
  for (const d of dietary) {
    const guestId = d.guest_id as string;
    if (!memberIds.has(guestId)) continue;
    const list = entriesByGuest.get(guestId) ?? [];
    list.push({
      categoryKey: d.category_key as string,
      label:
        labelOf.get(d.category_key as string) ?? (d.category_key as string),
      severity: d.severity === "allergy" ? "allergy" : "preference",
      details: text(d.details),
    });
    entriesByGuest.set(guestId, list);
  }

  return {
    id,
    displayName: h.display_name as string,
    contactEmail: text(h.contact_email) || null,
    plusOneAllowance: num(h.plus_one_allowance),
    address: asAddress(h.address),
    notes: text(h.notes),
    messageToCouple: text(h.message_to_couple),
    rsvpDeadlineOverride: text(h.rsvp_deadline_override),
    remindersOptOut: Boolean(h.reminders_opt_out),
    deliveryProblem: Boolean(h.delivery_problem),
    defaultDeadline: text(settings[0]?.default_rsvp_deadline),
    guests: members.map((g) => ({
      id: g.id as string,
      firstName: text(g.first_name),
      lastName: text(g.last_name),
      email: text(g.email),
      isPlaceholder: Boolean(g.is_placeholder),
      isPlusOne: Boolean(g.is_plus_one),
      dietaryNotes: text(g.dietary_notes),
      notes: text(g.notes),
      dietary: entriesByGuest.get(g.id as string) ?? [],
    })),
    dietaryCategories: categories.map((c) => ({
      key: c.key as string,
      label: c.label as string,
    })),
  };
}

/** Events to pick from in the "Invited to" filter and the create form. */
export async function loadEventOptions(
  supabase?: SupabaseClient,
): Promise<{ id: string; slug: string; name: string }[]> {
  const db = await client(supabase);
  const events = await rows(
    "events",
    db
      .from("events")
      .select("id, slug, name, display_order")
      .order("display_order", { ascending: true }),
  );
  return events.map((e) => ({
    id: e.id as string,
    slug: e.slug as string,
    name: e.name as string,
  }));
}
