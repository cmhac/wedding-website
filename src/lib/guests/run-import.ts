import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";
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
      /** The new households, to link sign-in accounts to afterwards. */
      householdIds: string[];
    }
  /** The file itself cannot be read (empty, not CSV, or missing columns). */
  | { kind: "invalid"; errors: ImportError[] };

type RpcResult = {
  created?: Partial<Counts>;
  errors?: ImportError[];
  household_ids?: { ref: string; household_id: string }[];
} | null;

export async function runGuestImport(
  supabase: SupabaseClient<Database>,
  csv: string,
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

  errors.sort((a, b) => a.row - b.row);
  return { kind: "done", created, errors, householdIds };
}
