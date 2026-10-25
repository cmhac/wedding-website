/**
 * Who answered an RSVP or chose a meal, worked out from the history tables
 * (research R8, data-model.md "Attributing answers"). Pure functions: the
 * caller fetches the history rows and the staff list.
 */

/** Staff display names by `staff.user_id`. */
export type StaffLookup = ReadonlyMap<string, string>;

export type AnsweredBy = (
  | { kind: "guest" }
  | { kind: "staff"; name: string }
  | { kind: "former_staff" }
  | { kind: "system" }
  | { kind: "unknown" }
  | { kind: "shared_account" }
  | { kind: "not_answered" }
) & { at?: string };

type HistoryBase = {
  id: number;
  actor_kind: string | null;
  changed_by: string | null;
  changed_at: string;
};

export type RsvpHistoryEntry = HistoryBase & { new_status: string };
export type MealHistoryEntry = HistoryBase & { new_dish_id: string | null };

function isNewer(a: HistoryBase, b: HistoryBase): boolean {
  const byTime = Date.parse(a.changed_at) - Date.parse(b.changed_at);
  return byTime !== 0 ? byTime > 0 : a.id > b.id;
}

function newestMatching<T extends HistoryBase>(
  rows: readonly T[],
  matches: (row: T) => boolean,
): T | undefined {
  let newest: T | undefined;
  for (const row of rows) {
    if (matches(row) && (!newest || isNewer(row, newest))) newest = row;
  }
  return newest;
}

function staffAnswer(row: HistoryBase, staff: StaffLookup): AnsweredBy {
  const name = row.changed_by ? staff.get(row.changed_by) : undefined;
  return name === undefined
    ? { kind: "former_staff", at: row.changed_at }
    : { kind: "staff", name, at: row.changed_at };
}

function fromActorKind(
  row: HistoryBase,
  staff: StaffLookup,
): AnsweredBy | null {
  switch (row.actor_kind) {
    case "guest":
      return { kind: "guest", at: row.changed_at };
    case "couple":
    case "planner":
      return staffAnswer(row, staff);
    case "system":
      return { kind: "system", at: row.changed_at };
    default:
      return null;
  }
}

/** The newest history row whose new status is the current status decides. */
export function answeredByForRsvp(args: {
  currentStatus: string;
  history: readonly RsvpHistoryEntry[];
  staff: StaffLookup;
}): AnsweredBy {
  const row = newestMatching(
    args.history,
    (r) => r.new_status === args.currentStatus,
  );
  if (!row) return { kind: "not_answered" };
  return (
    fromActorKind(row, args.staff) ?? { kind: "unknown", at: row.changed_at }
  );
}

/**
 * The newest history row (for this guest and course) whose new dish is the
 * current dish decides. A row with an empty actor_kind, written before the
 * column existed, falls back to comparing changed_by with the household's
 * sign-in account and the staff list.
 */
export function answeredByForMeal(args: {
  currentDishId: string | null;
  history: readonly MealHistoryEntry[];
  householdAuthUserId: string | null;
  staff: StaffLookup;
}): AnsweredBy {
  if (args.currentDishId === null) return { kind: "not_answered" };
  const row = newestMatching(
    args.history,
    (r) => r.new_dish_id === args.currentDishId,
  );
  if (!row) return { kind: "not_answered" };

  if (row.actor_kind !== null) {
    return (
      fromActorKind(row, args.staff) ?? { kind: "unknown", at: row.changed_at }
    );
  }

  const isHousehold =
    row.changed_by !== null && row.changed_by === args.householdAuthUserId;
  const isStaff = row.changed_by !== null && args.staff.has(row.changed_by);
  if (isHousehold && isStaff)
    return { kind: "shared_account", at: row.changed_at };
  if (isHousehold) return { kind: "guest", at: row.changed_at };
  if (isStaff) return staffAnswer(row, args.staff);
  return { kind: "unknown", at: row.changed_at };
}
