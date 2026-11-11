import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Whether texting exists at all (research: What "configured" and "available"
 * mean in code). Configured is a fact about the deployment: the provider's
 * settings are on the server. Available is configured AND the couple's switch
 * (`settings.sms_enabled`) is on. Every text feature checks `available`; the
 * admin banner checks `configured`. Components never read the environment:
 * server code calls this and passes booleans down.
 */

export type SmsState = {
  configured: boolean;
  enabled: boolean;
  available: boolean;
};

type SettingsDb = {
  from: (table: string) => {
    select: (columns: string) => {
      maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

function has(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Account, token, and either a messaging service or a from number. */
export function isSmsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    has(env.TWILIO_ACCOUNT_SID) &&
    has(env.TWILIO_AUTH_TOKEN) &&
    (has(env.TWILIO_MESSAGING_SERVICE_SID) || has(env.TWILIO_FROM_NUMBER))
  );
}

/**
 * Reads the switch only when configured. A database error counts as off, so a
 * fault can never turn texting on.
 */
export async function getSmsState(
  db?: SettingsDb,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SmsState> {
  if (!isSmsConfigured(env)) {
    return { configured: false, enabled: false, available: false };
  }
  let enabled = false;
  try {
    const client = db ?? (createAdminSupabase() as unknown as SettingsDb);
    const { data, error } = await client
      .from("settings")
      .select("sms_enabled")
      .maybeSingle();
    enabled =
      !error &&
      (data as { sms_enabled?: boolean } | null)?.sms_enabled === true;
  } catch {
    enabled = false;
  }
  return { configured: true, enabled, available: enabled };
}
