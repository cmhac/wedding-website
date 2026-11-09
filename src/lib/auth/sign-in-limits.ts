import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Typed-address sign-in limits (research R12). The address is reduced to a
 * keyed hash before it goes near the database, so the attempts table never
 * holds an address. The limiter itself is the `allow_sign_in_attempt` database
 * function, which reads its limits from settings.
 */

export function addressHash(email: string): string {
  const secret = process.env.INVITE_LINK_SECRET;
  if (!secret) throw new Error("INVITE_LINK_SECRET is not set");
  return createHmac("sha256", secret)
    .update(email.trim().toLowerCase())
    .digest("hex");
}

/** Records the attempt and says whether it may go ahead. Fails closed. */
export async function allowSignInAttempt(
  admin: SupabaseClient,
  hash: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("allow_sign_in_attempt", {
      address_hash: hash,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
