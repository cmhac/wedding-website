import type { SupabaseClient } from "@supabase/supabase-js";
import { authErrorResponse, requireStaff } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api-errors";
import {
  buildCatererCsv,
  buildGuestsCsv,
  buildResponsesCsv,
  type CatererData,
  type GuestEventRow,
  type ResponseRow,
} from "@/lib/exports/csv";
import { log } from "@/lib/log";

type Context = { params: Promise<{ kind: string }> };

// Loosely typed rows: the views and joins are read through the staff session.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const KINDS = ["guests", "responses", "caterer"] as const;
type Kind = (typeof KINDS)[number];

class ReadError extends Error {}

async function read(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new ReadError("read_failed");
  return (data as Row[] | null) ?? [];
}

const one = <T>(v: T | T[] | null | undefined): T | undefined =>
  Array.isArray(v) ? v[0] : (v ?? undefined);

const fullName = (g: Row) =>
  g.is_placeholder
    ? "Plus-one (unnamed)"
    : [g.first_name, g.last_name].filter(Boolean).join(" ");

/** First present value among the given keys (the views name columns slightly differently). */
function pick(row: Row, ...keys: string[]) {
  for (const k of keys)
    if (row[k] !== undefined && row[k] !== null) return row[k];
  return null;
}

/** Joins the per-restriction details and the guest's free-text note, skipping blanks and repeats. */
function joinNotes(...parts: unknown[]): string | null {
  const seen: string[] = [];
  for (const p of parts) {
    const text = typeof p === "string" ? p.trim() : "";
    if (text && !seen.includes(text)) seen.push(text);
  }
  return seen.length ? seen.join("; ") : null;
}

async function loadGuestRows(db: SupabaseClient) {
  const guests = await read(
    db
      .from("guests")
      .select(
        "id, first_name, last_name, is_placeholder, dietary_notes, households(display_name), guest_dietary(category_key), invitations(status, responded_at, events(id, name, starts_at))",
      ),
  );
  return guests;
}

function eventsOf(g: Row): Row[] {
  const invitations: Row[] = g.invitations ?? [];
  return invitations
    .map((i) => ({ ...i, event: one(i.events) as Row | undefined }))
    .sort((a, b) =>
      String(a.event?.starts_at ?? "").localeCompare(
        String(b.event?.starts_at ?? ""),
      ),
    );
}

async function guestsCsv(db: SupabaseClient) {
  const rows: GuestEventRow[] = [];
  for (const g of await loadGuestRows(db)) {
    for (const i of eventsOf(g)) {
      rows.push({
        household: one<Row>(g.households)?.display_name ?? "",
        guest: fullName(g),
        event: i.event?.name ?? "",
        status: i.status,
        dietary_categories: ((g.guest_dietary ?? []) as Row[]).map(
          (d) => d.category_key,
        ),
        dietary_notes: g.dietary_notes ?? null,
      });
    }
  }
  return buildGuestsCsv(rows);
}

async function responsesCsv(db: SupabaseClient) {
  const guests = await loadGuestRows(db);
  const selections = await read(
    db
      .from("meal_selections")
      .select("guest_id, dishes(name), courses(menus(event_id))"),
  );
  const dishesByKey = new Map<string, string[]>();
  for (const s of selections) {
    const eventId = one<Row>(one<Row>(s.courses)?.menus)?.event_id;
    const name = one<Row>(s.dishes)?.name;
    if (!eventId || !name) continue;
    const key = `${s.guest_id}:${eventId}`;
    dishesByKey.set(key, [...(dishesByKey.get(key) ?? []), name]);
  }
  const rows: ResponseRow[] = [];
  for (const g of guests) {
    for (const i of eventsOf(g)) {
      rows.push({
        household: one<Row>(g.households)?.display_name ?? "",
        guest: fullName(g),
        event: i.event?.name ?? "",
        status: i.status,
        responded_at: i.responded_at ?? null,
        dishes: dishesByKey.get(`${g.id}:${i.event?.id}`) ?? [],
      });
    }
  }
  return buildResponsesCsv(rows);
}

async function catererCsv(db: SupabaseClient) {
  const [totals, restrictions, conflicts] = await Promise.all([
    read(db.from("dish_totals").select("*")),
    read(db.from("dietary_list").select("*")),
    read(db.from("meal_conflicts").select("*")),
  ]);
  const data: CatererData = {
    dishTotals: [],
    notYetChosen: [],
    restrictions: [],
    conflicts: [],
  };
  for (const t of totals) {
    const event = String(pick(t, "event_name", "event") ?? "");
    const course = String(pick(t, "course_name", "course") ?? "");
    const dish = pick(t, "dish_name", "dish");
    // `not_yet_chosen` is a flag on the row; the count is in `chosen_count`.
    if (t.not_yet_chosen === true || dish === null) {
      data.notYetChosen.push({
        event,
        course,
        count: Number(pick(t, "chosen_count", "count") ?? 0),
      });
    } else {
      data.dishTotals.push({
        event,
        course,
        dish: String(dish),
        count: Number(pick(t, "chosen_count", "count") ?? 0),
      });
    }
  }
  for (const r of restrictions) {
    data.restrictions.push({
      event: String(pick(r, "event_name", "event") ?? ""),
      household: String(pick(r, "household_name", "household") ?? ""),
      guest: String(pick(r, "guest_name", "guest") ?? ""),
      severity: String(r.severity ?? ""),
      category: pick(r, "category_key", "category"),
      notes: joinNotes(r.details, r.dietary_notes),
    });
  }
  for (const c of conflicts) {
    data.conflicts.push({
      event: String(pick(c, "event_name", "event") ?? ""),
      course: String(pick(c, "course_name", "course") ?? ""),
      dish: String(pick(c, "dish_name", "dish") ?? ""),
      household: String(pick(c, "household_name", "household") ?? ""),
      guest: String(pick(c, "guest_name", "guest") ?? ""),
      category: pick(c, "category_key", "category"),
    });
  }
  return buildCatererCsv(data);
}

const BUILDERS: Record<Kind, (db: SupabaseClient) => Promise<string>> = {
  guests: guestsCsv,
  responses: responsesCsv,
  caterer: catererCsv,
};

/** GET /api/admin/exports/[kind]: staff download of guests, responses, or caterer data as CSV. */
export async function GET(_request: Request, { params }: Context) {
  let session;
  try {
    session = await requireStaff();
  } catch (e) {
    const denied = authErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  const { kind } = await params;
  if (!(KINDS as readonly string[]).includes(kind)) {
    return errorResponse(404, "not_found", "That export does not exist.");
  }

  try {
    const csv = await BUILDERS[kind as Kind](session.supabase);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${kind}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    log.error("export_failed", {
      kind,
      code: e instanceof ReadError ? "read_failed" : "build_failed",
    });
    return errorResponse(500, "server_error", "The export could not be built.");
  }
}
