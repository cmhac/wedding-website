import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

/**
 * Keeps a household's sign-in account (a Supabase Auth user) in step with its
 * contact email, using the service-role client (research R2: one Auth user per
 * household, one email per household). Route handlers and scripts call these
 * helpers; none of them logs or returns an email address in a failure result.
 *
 * The household's paper-only state is derived: no contact email means paper-only.
 */

export type HouseholdAccessFailure = {
  ok: false;
  code: "email_in_use" | "invalid_payload" | "not_found" | "failed";
};

export type HouseholdSummary = {
  id: string;
  display_name: string;
  contact_email: string | null;
  auth_user_id: string | null;
  plus_one_allowance: number;
  paper_only: boolean;
};

export type NewGuest = {
  first_name: string;
  last_name: string;
  email?: string | null;
  dietary_notes?: string | null;
  notes?: string | null;
};

export type NewHousehold = {
  display_name: string;
  contact_email: string | null;
  plus_one_allowance?: number;
  address?: Record<string, string> | null;
  notes?: string | null;
  guests: NewGuest[];
};

type Client = SupabaseClient<Database>;

const normalize = (email: string) => email.trim().toLowerCase();

/** The stable code word a staff-only database function raised, if any. */
function rpcCode(
  error: { message?: string } | null,
): HouseholdAccessFailure["code"] {
  const m = error?.message ?? "";
  if (m === "email_in_use" || m === "invalid_payload" || m === "not_found") {
    return m;
  }
  return "failed";
}

function summary(
  row: Pick<
    HouseholdSummary,
    "id" | "display_name" | "contact_email" | "auth_user_id"
  > & { plus_one_allowance: number },
): HouseholdSummary {
  return { ...row, paper_only: row.contact_email === null };
}

async function createAuthUser(
  admin: Client,
  email: string,
): Promise<{ id: string } | HouseholdAccessFailure> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data?.user) {
    return {
      ok: false,
      code: error?.code === "email_exists" ? "email_in_use" : "failed",
    };
  }
  return { id: data.user.id };
}

/** True when the account belongs to a staff member, so it must never be removed with a household. */
async function isStaffUser(staff: Client, userId: string): Promise<boolean> {
  const { data } = await staff
    .from("staff")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Creates the sign-in account with the service-role client (`admin`), then the
 * household, guests and invitations through the staff-only database function
 * with the signed-in staff member's client (`staff`), so the change is
 * attributed to them. The account is removed again if the household fails.
 */
export async function createHouseholdWithAccess(
  admin: Client,
  staff: Client,
  input: NewHousehold,
): Promise<
  | { ok: true; household: HouseholdSummary; guestIds: string[] }
  | HouseholdAccessFailure
> {
  const email = input.contact_email ? normalize(input.contact_email) : null;

  let userId: string | null = null;
  if (email) {
    const created = await createAuthUser(admin, email);
    if ("ok" in created) return created;
    userId = created.id;
  }

  const { data, error } = await staff.rpc("create_household_record", {
    payload: {
      display_name: input.display_name,
      contact_email: email,
      auth_user_id: userId,
      plus_one_allowance: input.plus_one_allowance ?? 0,
      address: input.address ?? null,
      notes: input.notes ?? null,
      guests: input.guests.map((g) => ({
        first_name: g.first_name,
        last_name: g.last_name,
        email: g.email ?? null,
        dietary_notes: g.dietary_notes ?? null,
        notes: g.notes ?? null,
      })),
    },
  });
  const result = data as { household_id: string; guest_ids: string[] } | null;
  if (error || !result) {
    if (userId) await admin.auth.admin.deleteUser(userId);
    return { ok: false, code: rpcCode(error) };
  }
  return {
    ok: true,
    household: summary({
      id: result.household_id,
      display_name: input.display_name,
      contact_email: email,
      auth_user_id: userId,
      plus_one_allowance: input.plus_one_allowance ?? 0,
    }),
    guestIds: result.guest_ids ?? [],
  };
}

/**
 * Changes the contact email and keeps the sign-in account in step: the account
 * is created, updated or (when the email is cleared) removed with `admin`, and
 * the household is saved through `set_household_contact` with `staff`.
 */
export async function updateHouseholdContactEmail(
  admin: Client,
  staff: Client,
  householdId: string,
  contactEmail: string | null,
): Promise<{ ok: true; household: HouseholdSummary } | HouseholdAccessFailure> {
  const current = await staff
    .from("households")
    .select("id, display_name, contact_email, auth_user_id, plus_one_allowance")
    .eq("id", householdId)
    .maybeSingle();
  if (current.error) return { ok: false, code: "failed" };
  if (!current.data) return { ok: false, code: "not_found" };
  const userId = current.data.auth_user_id;
  const oldEmail = current.data.contact_email;
  const email = contactEmail ? normalize(contactEmail) : null;

  let nextUserId: string | null = null;
  let createdUserId: string | null = null;
  let changedExisting = false;
  if (email !== null) {
    if (userId) {
      const updated = await admin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (updated.error) {
        return {
          ok: false,
          code:
            updated.error.code === "email_exists" ? "email_in_use" : "failed",
        };
      }
      nextUserId = userId;
      changedExisting = true;
    } else {
      const created = await createAuthUser(admin, email);
      if ("ok" in created) return created;
      nextUserId = created.id;
      createdUserId = created.id;
    }
  }

  const saved = await staff.rpc("set_household_contact", {
    household_id: householdId,
    // The function accepts null (paper-only); the generated argument types do not say so.
    contact_email: email as string,
    auth_user_id: nextUserId as string,
  });
  if (saved.error) {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    if (changedExisting && userId && oldEmail) {
      await admin.auth.admin.updateUserById(userId, { email: oldEmail });
    }
    return { ok: false, code: rpcCode(saved.error) };
  }

  // Clearing the email unlinks the account; remove it unless it is a staff member's.
  const previous = (
    saved.data as { previous_auth_user_id: string | null } | null
  )?.previous_auth_user_id;
  if (email === null && previous && !(await isStaffUser(staff, previous))) {
    const removed = await admin.auth.admin.deleteUser(previous);
    if (removed.error) return { ok: false, code: "failed" };
  }

  return {
    ok: true,
    household: summary({
      id: current.data.id,
      display_name: current.data.display_name,
      contact_email: email,
      auth_user_id: nextUserId,
      plus_one_allowance: Number(current.data.plus_one_allowance ?? 0),
    }),
  };
}

/**
 * Deletes the household (its guests go with it) through the staff-only
 * function, then its sign-in account, unless that account is a staff member's.
 */
export async function deleteHouseholdWithAccess(
  admin: Client,
  staff: Client,
  householdId: string,
): Promise<{ ok: true } | HouseholdAccessFailure> {
  const { data, error } = await staff.rpc("delete_household_record", {
    household_id: householdId,
  });
  if (error) return { ok: false, code: rpcCode(error) };
  const result = data as {
    auth_user_id: string | null;
    auth_user_is_staff: boolean;
  } | null;
  if (result?.auth_user_id && !result.auth_user_is_staff) {
    await admin.auth.admin.deleteUser(result.auth_user_id);
  }
  return { ok: true };
}

/**
 * Creates and links sign-in accounts for the listed households (the
 * `household_ids` an import returns) that have a contact email but no account;
 * the import itself creates none. With `options.staff`, the link is saved
 * through `set_household_contact` so it is attributed to that staff member;
 * without it (a script holding only the service-role key) the household row is
 * updated directly. Returns counts only.
 */
export async function linkHouseholdAccounts(
  admin: Client,
  householdIds: string[],
  options: { staff?: Client } = {},
): Promise<{ linked: number; failed: number }> {
  if (householdIds.length === 0) return { linked: 0, failed: 0 };
  const pending = await admin
    .from("households")
    .select("id, contact_email")
    .in("id", householdIds)
    .is("auth_user_id", null)
    .not("contact_email", "is", null);
  if (pending.error) return { linked: 0, failed: householdIds.length };

  let linked = 0;
  let failed = 0;
  for (const row of pending.data ?? []) {
    const email = normalize(row.contact_email as string);
    const created = await createAuthUser(admin, email);
    if ("ok" in created) {
      failed++;
      continue;
    }
    const error = options.staff
      ? (
          await options.staff.rpc("set_household_contact", {
            household_id: row.id,
            contact_email: email,
            auth_user_id: created.id,
          })
        ).error
      : (
          await admin
            .from("households")
            .update({ auth_user_id: created.id })
            .eq("id", row.id)
        ).error;
    if (error) {
      await admin.auth.admin.deleteUser(created.id);
      failed++;
    } else {
      linked++;
    }
  }
  return { linked, failed };
}
