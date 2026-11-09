import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";
import { createHouseholdAuthUser } from "./household-access.ts";
import { parseGuestImport, type ImportError } from "./import.ts";

/**
 * Shared by the import route and scripts/import-guests.ts: loads the event
 * slugs, parses and validates the CSV, and sends the valid households to the
 * `import_households` database function (specs contract database-rpc.md),
 * which creates each household and its guests together or not at all.
 *
 * Relative imports with explicit extensions let a plain Node script load this
 * file. It never logs and never puts cell values in an error.
 */

export type Counts = {
  households: number;
  guests: number;
  invitations: number;
};

export type RunImportResult =
  | {
      kind: "done";
      created: Counts;
      errors: ImportError[];
      /** The new households. */
      householdIds: string[];
      /** Sign-in accounts created for them (counts only). */
      accounts: { linked: number; failed: number };
    }
  /** The file itself cannot be read (empty, not CSV, or missing columns). */
  | { kind: "invalid"; errors: ImportError[] };

type RpcResult = {
  created?: Partial<Counts>;
  errors?: ImportError[];
  household_ids?: { ref: string; household_id: string }[];
} | null;

/**
 * Gives each new household its sign-in account (research R2): an Auth user with
 * a synthetic address, linked on the household row. `admin` is the service-role
 * client. Returns counts only; an account that cannot be linked is removed.
 */
async function provisionAccounts(
  admin: SupabaseClient<Database>,
  householdIds: string[],
): Promise<{ linked: number; failed: number }> {
  let linked = 0;
  let failed = 0;
  for (const id of householdIds) {
    const user = await createHouseholdAuthUser(admin, id);
    if (!user) {
      failed++;
      continue;
    }
    const { error } = await admin
      .from("households")
      .update({ auth_user_id: user.id })
      .eq("id", id);
    if (error) {
      await admin.auth.admin.deleteUser(user.id);
      failed++;
    } else {
      linked++;
    }
  }
  return { linked, failed };
}

/**
 * With `admin` (the service-role client), every imported household also gets its
 * sign-in account; without it no accounts are created.
 */
export async function runGuestImport(
  supabase: SupabaseClient<Database>,
  csv: string,
  admin?: SupabaseClient<Database>,
): Promise<RunImportResult> {
  const events = await supabase.from("events").select("slug");
  if (events.error) throw new Error("The import could not be completed.");
  const eventSlugs = ((events.data ?? []) as { slug: string }[]).map(
    (e) => e.slug,
  );

  const parsed = parseGuestImport(csv, { eventSlugs });
  // Row 1 errors mean the file or its header is unusable.
  if (
    parsed.households.length === 0 &&
    parsed.errors.some((e) => e.row === 1)
  ) {
    return { kind: "invalid", errors: parsed.errors };
  }

  const created: Counts = { households: 0, guests: 0, invitations: 0 };
  const errors = [...parsed.errors];
  const householdIds: string[] = [];

  if (parsed.households.length > 0) {
    const { data, error } = await supabase.rpc("import_households", {
      rows: parsed.households,
    });
    if (error) throw new Error("The import could not be completed.");
    const result = data as RpcResult;
    created.households = result?.created?.households ?? 0;
    created.guests = result?.created?.guests ?? 0;
    created.invitations = result?.created?.invitations ?? 0;
    errors.push(...(result?.errors ?? []));
    householdIds.push(
      ...(result?.household_ids ?? []).map((h) => h.household_id),
    );
  }

  const accounts =
    admin && householdIds.length > 0
      ? await provisionAccounts(admin, householdIds)
      : { linked: 0, failed: 0 };

  errors.sort((a, b) => a.row - b.row);
  return { kind: "done", created, errors, householdIds, accounts };
}
