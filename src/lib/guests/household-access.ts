import type { SupabaseClient } from "@supabase/supabase-js";

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
  code: "email_in_use" | "not_found" | "failed";
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

type Admin = SupabaseClient;

const normalize = (email: string) => email.trim().toLowerCase();

function summary(row: Record<string, unknown>): HouseholdSummary {
  const contact = (row.contact_email as string | null) ?? null;
  return {
    id: row.id as string,
    display_name: row.display_name as string,
    contact_email: contact,
    auth_user_id: (row.auth_user_id as string | null) ?? null,
    plus_one_allowance: Number(row.plus_one_allowance ?? 0),
    paper_only: contact === null,
  };
}

/** True when a household other than `exceptId` already uses this email. */
async function emailTaken(admin: Admin, email: string, exceptId?: string) {
  const { data, error } = await admin
    .from("households")
    .select("id")
    .eq("contact_email", email);
  if (error) return null;
  return (data ?? []).some((r: { id: string }) => r.id !== exceptId);
}

async function createAuthUser(
  admin: Admin,
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

export async function createHouseholdWithAccess(
  admin: Admin,
  input: NewHousehold,
): Promise<
  | { ok: true; household: HouseholdSummary; guestIds: string[] }
  | HouseholdAccessFailure
> {
  const email = input.contact_email ? normalize(input.contact_email) : null;

  let userId: string | null = null;
  if (email) {
    const taken = await emailTaken(admin, email);
    if (taken === null) return { ok: false, code: "failed" };
    if (taken) return { ok: false, code: "email_in_use" };
    const created = await createAuthUser(admin, email);
    if ("ok" in created) return created;
    userId = created.id;
  }

  const rollback = async (householdId?: string) => {
    if (householdId) {
      await admin.from("households").delete().eq("id", householdId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  };

  const inserted = await admin
    .from("households")
    .insert({
      display_name: input.display_name,
      contact_email: email,
      auth_user_id: userId,
      plus_one_allowance: input.plus_one_allowance ?? 0,
      address: input.address ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    await rollback();
    // A concurrent save of the same email loses at the unique constraint.
    return {
      ok: false,
      code: inserted.error?.code === "23505" ? "email_in_use" : "failed",
    };
  }
  const household = summary(inserted.data);

  let guestIds: string[] = [];
  if (input.guests.length > 0) {
    const guestRows = await admin
      .from("guests")
      .insert(
        input.guests.map((g) => ({
          household_id: household.id,
          first_name: g.first_name,
          last_name: g.last_name,
          email: g.email ?? null,
          dietary_notes: g.dietary_notes ?? null,
          notes: g.notes ?? null,
        })),
      )
      .select("id");
    if (guestRows.error) {
      await rollback(household.id);
      return { ok: false, code: "failed" };
    }
    guestIds = ((guestRows.data ?? []) as { id: string }[]).map((g) => g.id);
  }
  return { ok: true, household, guestIds };
}

export async function updateHouseholdContactEmail(
  admin: Admin,
  householdId: string,
  contactEmail: string | null,
): Promise<{ ok: true; household: HouseholdSummary } | HouseholdAccessFailure> {
  const current = await admin
    .from("households")
    .select("*")
    .eq("id", householdId)
    .maybeSingle();
  if (current.error) return { ok: false, code: "failed" };
  if (!current.data) return { ok: false, code: "not_found" };
  const userId = (current.data.auth_user_id as string | null) ?? null;
  const email = contactEmail ? normalize(contactEmail) : null;

  let nextUserId: string | null = userId;
  if (email === null) {
    // Clearing the email unlinks the sign-in account and makes the household paper-only.
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) return { ok: false, code: "failed" };
    }
    nextUserId = null;
  } else {
    const taken = await emailTaken(admin, email, householdId);
    if (taken === null) return { ok: false, code: "failed" };
    if (taken) return { ok: false, code: "email_in_use" };
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
    } else {
      const created = await createAuthUser(admin, email);
      if ("ok" in created) return created;
      nextUserId = created.id;
    }
  }

  const saved = await admin
    .from("households")
    .update({ contact_email: email, auth_user_id: nextUserId })
    .eq("id", householdId)
    .select("*")
    .single();
  if (saved.error || !saved.data) {
    if (!userId && nextUserId) await admin.auth.admin.deleteUser(nextUserId);
    return {
      ok: false,
      code: saved.error?.code === "23505" ? "email_in_use" : "failed",
    };
  }
  return { ok: true, household: summary(saved.data) };
}

/** Deletes the household (its guests go with it) and then its sign-in account. */
export async function deleteHouseholdWithAccess(
  admin: Admin,
  householdId: string,
): Promise<{ ok: true } | HouseholdAccessFailure> {
  const current = await admin
    .from("households")
    .select("id, auth_user_id")
    .eq("id", householdId)
    .maybeSingle();
  if (current.error) return { ok: false, code: "failed" };
  if (!current.data) return { ok: false, code: "not_found" };

  const removed = await admin.from("households").delete().eq("id", householdId);
  if (removed.error) return { ok: false, code: "failed" };
  const userId = current.data.auth_user_id as string | null;
  if (userId) await admin.auth.admin.deleteUser(userId);
  return { ok: true };
}

/**
 * Creates and links sign-in accounts for households that have a contact email
 * but no account yet (for example, households just created by the CSV import,
 * which writes rows but cannot create Auth users). Returns counts only.
 */
export async function linkPendingHouseholdAccounts(
  admin: Admin,
): Promise<{ linked: number; failed: number }> {
  const pending = await admin
    .from("households")
    .select("id, contact_email")
    .is("auth_user_id", null)
    .not("contact_email", "is", null);
  if (pending.error) return { linked: 0, failed: 0 };

  let linked = 0;
  let failed = 0;
  for (const row of (pending.data ?? []) as {
    id: string;
    contact_email: string;
  }[]) {
    const created = await createAuthUser(admin, normalize(row.contact_email));
    if ("ok" in created) {
      failed++;
      continue;
    }
    const saved = await admin
      .from("households")
      .update({ auth_user_id: created.id })
      .eq("id", row.id);
    if (saved.error) {
      await admin.auth.admin.deleteUser(created.id);
      failed++;
    } else {
      linked++;
    }
  }
  return { linked, failed };
}
