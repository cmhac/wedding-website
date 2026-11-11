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
      /** Phone numbers saved, and phone cells dropped (texting not configured, or no service-role client). */
      phonesSaved?: number;
      phonesIgnored?: number;
      /** Numbers recorded as consented by the import's consent column. */
      phonesConsented?: number;
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
  options: {
    smsConfigured?: boolean;
    /** The staff member running the import: recorded as who marked imported consent. */
    importedBy?: string;
  } = {},
): Promise<RunImportResult> {
  const events = await supabase.from("events").select("slug");
  if (events.error) throw new Error("The import could not be completed.");
  const eventSlugs = ((events.data ?? []) as { slug: string }[]).map(
    (e) => e.slug,
  );

  const parsed = parseGuestImport(csv, {
    eventSlugs,
    smsConfigured: options.smsConfigured === true,
  });
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
  let rpcHouseholdIds: { ref: string; household_id: string }[] | undefined;

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
    rpcHouseholdIds = result?.household_ids;
    householdIds.push(
      ...(result?.household_ids ?? []).map((h) => h.household_id),
    );
  }

  // Phone numbers are saved by a service-role function, one at a time, after
  // the households exist; a number another household already has is reported
  // by row and column, and the rest carry on. A number marked yes in a consent
  // column is then recorded as consented "by import".
  let phonesSaved = 0;
  let phonesConsented = 0;
  let phonesIgnored = parsed.phonesIgnored ?? 0;
  const idByRef = new Map(
    (rpcHouseholdIds ?? []).map((h) => [h.ref, h.household_id]),
  );
  for (const household of parsed.households) {
    const phones = household.phones ?? [];
    if (phones.length === 0) continue;
    const id = idByRef.get(household.ref);
    // No id means the database rejected the household (already reported as
    // errors), so its numbers are not "ignored".
    if (!id) continue;
    if (!admin) {
      phonesIgnored += phones.length;
      continue;
    }
    for (const value of phones) {
      const { error } = await (
        admin as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => PromiseLike<{ error: { message?: string } | null }>;
        }
      ).rpc("add_phone_contact", { household_id: id, value });
      if (!error) {
        phonesSaved++;
        if ((household.consented_phones ?? []).includes(value)) {
          const marked = await (
            admin as unknown as {
              rpc: (
                fn: string,
                args: Record<string, unknown>,
              ) => PromiseLike<{ error: { message?: string } | null }>;
            }
          ).rpc("import_phone_consent", {
            household_id: id,
            value,
            marked_by: options.importedBy ?? null,
            override_declined: false,
          });
          if (marked.error) {
            errors.push({
              row: household.guests[0]?.row ?? 1,
              field: "contact_phone_consent",
              message: "The consent mark was not saved",
            });
          } else {
            phonesConsented++;
          }
        }
        continue;
      }
      errors.push({
        row: household.guests[0]?.row ?? 1,
        field: "contact_phone",
        message:
          error.message === "phone_in_use"
            ? "Already used by another household"
            : "The number was not saved",
      });
    }
  }

  const accounts =
    admin && householdIds.length > 0
      ? await provisionAccounts(admin, householdIds)
      : { linked: 0, failed: 0 };

  errors.sort((a, b) => a.row - b.row);
  return {
    kind: "done",
    created,
    errors,
    householdIds,
    accounts,
    ...(phonesSaved > 0 ? { phonesSaved } : {}),
    ...(phonesConsented > 0 ? { phonesConsented } : {}),
    ...(phonesIgnored > 0 ? { phonesIgnored } : {}),
  };
}
