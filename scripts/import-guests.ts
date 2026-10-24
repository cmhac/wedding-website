/**
 * Imports a guest-list CSV with the same library the admin import endpoint uses.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-guests.ts <path-to-csv>
 *
 * Prints counts and row errors only; never guest names or emails (error
 * messages never repeat cell values). Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. The script reads the key itself because the app's
 * service-role helper is server-only and cannot be loaded outside Next.js.
 */
import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.ts";
import { linkHouseholdAccounts } from "../src/lib/guests/household-access.ts";
import {
  runGuestImport,
  type RunImportResult,
} from "../src/lib/guests/run-import.ts";

export function formatReport(result: RunImportResult): string {
  const lines: string[] = [];
  if (result.kind === "invalid") {
    lines.push("The file could not be read; nothing was imported.");
  } else {
    const c = result.created;
    lines.push(
      `Created ${c.households} households, ${c.guests} guests, ${c.invitations} invitations.`,
    );
  }
  if (result.errors.length > 0) {
    lines.push(`${result.errors.length} row problem(s):`);
    for (const e of result.errors) {
      lines.push(`  Row ${e.row} (${e.field}): ${e.message}`);
    }
  }
  return lines.join("\n");
}

export async function importGuestsFromFile(
  admin: SupabaseClient<Database>,
  path: string,
  read: (path: string) => Promise<string> = (p) => readFile(p, "utf8"),
): Promise<string> {
  const csv = await read(path);
  const result = await runGuestImport(admin, csv);
  const lines = [formatReport(result)];
  if (result.kind === "done" && result.created.households > 0) {
    const link = await linkHouseholdAccounts(admin, result.householdIds);
    lines.push(
      `Sign-in accounts: ${link.linked} linked, ${link.failed} failed.`,
    );
  }
  return lines.join("\n");
}

async function main() {
  try {
    const path = process.argv[2];
    if (!path || process.argv.length !== 3) {
      throw new Error("Usage: import-guests <path-to-csv>");
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example with --env-file=.env.local).",
      );
    }
    const admin = createClient<Database>(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    process.stdout.write(`${await importGuestsFromFile(admin, path)}\n`);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("import-guests.ts")) {
  void main();
}
