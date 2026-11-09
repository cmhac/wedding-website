/**
 * One-off: gives every household's sign-in account the synthetic address
 * `household-<household id>@<domain>` (research R2), for households created
 * before addresses moved into household_contacts. Idempotent: accounts that
 * already have the synthetic address are left alone, so it is safe to run
 * twice. Run it once, before deploying, if any households exist.
 *
 * Usage:
 *   node --env-file=.env.local scripts/convert-household-accounts.ts
 *
 * Prints counts only, never an address. Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY; HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN is optional
 * (default households.invalid).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.ts";
import { householdAccountEmail } from "../src/lib/guests/household-access.ts";

export type ConversionCounts = {
  renamed: number;
  alreadySynthetic: number;
  failed: number;
};

export async function convertHouseholdAccounts(
  admin: SupabaseClient<Database>,
  domain: string = process.env.HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN ||
    "households.invalid",
): Promise<ConversionCounts> {
  const counts: ConversionCounts = {
    renamed: 0,
    alreadySynthetic: 0,
    failed: 0,
  };
  const households = await admin
    .from("households")
    .select("id, auth_user_id")
    .not("auth_user_id", "is", null);
  if (households.error) throw new Error("The households could not be read.");

  for (const household of households.data ?? []) {
    const userId = household.auth_user_id as string;
    const wanted = householdAccountEmail(household.id, domain);
    const user = await admin.auth.admin.getUserById(userId);
    const current = user.data?.user?.email;
    if (user.error || !user.data?.user) {
      counts.failed++;
      continue;
    }
    if (current?.toLowerCase() === wanted) {
      counts.alreadySynthetic++;
      continue;
    }
    const updated = await admin.auth.admin.updateUserById(userId, {
      email: wanted,
      email_confirm: true,
    });
    if (updated.error) counts.failed++;
    else counts.renamed++;
  }
  return counts;
}

export function formatConversionReport(counts: ConversionCounts): string {
  return `Household sign-in accounts: ${counts.renamed} renamed, ${counts.alreadySynthetic} already had the synthetic address, ${counts.failed} failed.`;
}

async function main() {
  try {
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
    const counts = await convertHouseholdAccounts(admin);
    process.stdout.write(`${formatConversionReport(counts)}\n`);
    if (counts.failed > 0) process.exitCode = 1;
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("convert-household-accounts.ts")) {
  void main();
}
