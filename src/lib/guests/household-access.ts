import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

/**
 * Keeps each household's sign-in account (a Supabase Auth user) and its
 * addresses apart (research R2). Every household has exactly one Auth user with
 * a synthetic address that is never mailed; the real addresses live only in
 * `household_contacts`, so adding, changing or removing one never touches the
 * sign-in system. Route handlers and scripts call these helpers; none of them
 * logs or returns an address in a failure result.
 *
 * The household's paper-only state is derived: no addresses means paper-only.
 */

export type HouseholdAccessFailure = {
  ok: false;
  code:
    | "email_in_use"
    | "invalid_payload"
    | "not_found"
    | "staff_account"
    | "failed";
};

export type HouseholdSummary = {
  id: string;
  display_name: string;
  auth_user_id: string | null;
  plus_one_allowance: number;
  contact_count: number;
  paper_only: boolean;
};

export type NewGuest = {
  first_name: string;
  last_name: string;
  email?: string | null;
  dietary_notes?: string | null;
  notes?: string | null;
};

export type NewContact = { kind: "email"; value: string };

export type NewHousehold = {
  display_name: string;
  contacts: NewContact[];
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
  if (
    m === "email_in_use" ||
    m === "invalid_payload" ||
    m === "not_found" ||
    m === "staff_account"
  ) {
    return m;
  }
  return "failed";
}

/** The synthetic address of a household's sign-in account. It never receives mail. */
export function householdAccountEmail(
  householdId: string,
  domain: string = process.env.HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN ||
    "households.invalid",
): string {
  return `household-${householdId}@${domain}`;
}

/** Creates the household's sign-in account (an Auth user) with its synthetic address. */
export async function createHouseholdAuthUser(
  admin: Client,
  householdId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await admin.auth.admin.createUser({
    email: householdAccountEmail(householdId),
    email_confirm: true,
  });
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

/**
 * Creates the household's sign-in account with the service-role client
 * (`admin`), then the household, guests and invitations through the staff-only
 * database function with the signed-in staff member's client (`staff`), so the
 * change is attributed to them. The household id is chosen here because it is
 * part of the account's synthetic address. The account is removed again if the
 * household fails.
 */
export async function createHouseholdWithAccess(
  admin: Client,
  staff: Client,
  input: NewHousehold,
): Promise<
  | { ok: true; household: HouseholdSummary; guestIds: string[] }
  | HouseholdAccessFailure
> {
  const householdId = randomUUID();
  const contacts = input.contacts.map((c) => normalize(c.value));

  const user = await createHouseholdAuthUser(admin, householdId);
  if (!user) return { ok: false, code: "failed" };

  const { data, error } = await staff.rpc("create_household_record", {
    payload: {
      id: householdId,
      display_name: input.display_name,
      contacts,
      auth_user_id: user.id,
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
    await admin.auth.admin.deleteUser(user.id);
    return { ok: false, code: rpcCode(error) };
  }
  return {
    ok: true,
    household: {
      id: result.household_id,
      display_name: input.display_name,
      auth_user_id: user.id,
      plus_one_allowance: input.plus_one_allowance ?? 0,
      contact_count: contacts.length,
      paper_only: contacts.length === 0,
    },
    guestIds: result.guest_ids ?? [],
  };
}

/** Adds an address to a household. Staff only; never touches the sign-in system. */
export async function addHouseholdContact(
  staff: Client,
  householdId: string,
  value: string,
): Promise<{ ok: true; contactId: string } | HouseholdAccessFailure> {
  const { data, error } = await staff.rpc("add_household_contact", {
    household_id: householdId,
    value: normalize(value),
  });
  if (error || typeof data !== "string") {
    return { ok: false, code: rpcCode(error) };
  }
  return { ok: true, contactId: data };
}

/** Changes an address. The database clears its delivery problem flag. */
export async function updateHouseholdContact(
  staff: Client,
  householdId: string,
  contactId: string,
  value: string,
): Promise<{ ok: true } | HouseholdAccessFailure> {
  const { error } = await staff.rpc("update_household_contact", {
    household_id: householdId,
    contact_id: contactId,
    value: normalize(value),
  });
  if (error) return { ok: false, code: rpcCode(error) };
  return { ok: true };
}

/** Removes an address; `paperOnly` is true when it was the household's last. */
export async function removeHouseholdContact(
  staff: Client,
  householdId: string,
  contactId: string,
): Promise<{ ok: true; paperOnly: boolean } | HouseholdAccessFailure> {
  const { data, error } = await staff.rpc("remove_household_contact", {
    household_id: householdId,
    contact_id: contactId,
  });
  if (error) return { ok: false, code: rpcCode(error) };
  const result = data as { paper_only?: boolean } | null;
  return { ok: true, paperOnly: result?.paper_only === true };
}

/**
 * Deletes the household (its guests and addresses go with it) through the
 * staff-only function, then its sign-in account, unless that account is a
 * staff member's.
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
