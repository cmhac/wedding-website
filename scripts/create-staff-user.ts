/**
 * Creates a staff sign-in account (the couple or the planner).
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-staff-user.ts <email> <display name> <couple|planner>
 *
 * Staff Auth users exist only because this script creates them: the staff
 * sign-in endpoint never creates users. Prints only the new user id.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The script
 * reads the key itself because the app's service-role helper is server-only
 * and cannot be loaded outside Next.js.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const STAFF_ROLES = ["couple", "planner"] as const;

const inputSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1),
  role: z.enum(STAFF_ROLES),
});

export type StaffInput = z.infer<typeof inputSchema>;

export function parseArgs(args: string[]): StaffInput {
  if (args.length !== 3) {
    throw new Error(
      "Usage: create-staff-user <email> <display name> <couple|planner>",
    );
  }
  const [email, displayName, role] = args;
  if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
    throw new Error(`Unknown role. Use one of: ${STAFF_ROLES.join(", ")}`);
  }
  const parsed = inputSchema.safeParse({ email, displayName, role });
  if (!parsed.success) {
    throw new Error("Invalid email address or display name.");
  }
  return parsed.data;
}

/** Creates the Auth user and the staff row; returns the user id. */
export async function createStaffUser(
  admin: SupabaseClient,
  input: StaffInput,
): Promise<string> {
  if (!STAFF_ROLES.includes(input.role)) {
    throw new Error(`Unknown role. Use one of: ${STAFF_ROLES.join(", ")}`);
  }
  const created = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
  });
  const id = created.data?.user?.id;
  if (created.error || !id) {
    // The error text can contain the address, so it is not passed on.
    throw new Error("Could not create the sign-in account.");
  }
  const inserted = await admin.from("staff").insert({
    user_id: id,
    role: input.role,
    display_name: input.displayName,
  });
  if (inserted.error) {
    await admin.auth.admin.deleteUser(id);
    throw new Error("Could not add the staff record; the account was removed.");
  }
  return id;
}

async function main() {
  try {
    const input = parseArgs(process.argv.slice(2));
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example with --env-file=.env.local).",
      );
    }
    const admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log(await createStaffUser(admin, input));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("create-staff-user.ts")) {
  void main();
}
