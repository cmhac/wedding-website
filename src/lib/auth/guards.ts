import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession, type Session } from "./session";

/** Thrown by the guards; handlers map it to a 401 or 403 response. */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: "unauthenticated" | "forbidden",
  ) {
    super(code);
    this.name = "AuthError";
  }
}

export async function requireStaff(
  supabase?: SupabaseClient,
): Promise<Session> {
  const session = await getSession(supabase);
  if (!session) {
    // Distinguish "not signed in" from "signed in but neither staff nor guest".
    throw await denial(supabase);
  }
  if (session.kind !== "staff") throw new AuthError(403, "forbidden");
  return session;
}

export async function requireCouple(
  supabase?: SupabaseClient,
): Promise<Session> {
  const session = await requireStaff(supabase);
  if (session.role !== "couple") throw new AuthError(403, "forbidden");
  return session;
}

export async function requireGuest(
  supabase?: SupabaseClient,
): Promise<Session> {
  const session = await getSession(supabase);
  if (!session) throw await denial(supabase);
  // A user who is both staff and a household responder is treated as staff.
  if (session.kind !== "guest") throw new AuthError(403, "forbidden");
  return session;
}

async function denial(supabase?: SupabaseClient): Promise<AuthError> {
  const { createServerSupabase } = await import("@/lib/supabase/server");
  const client = supabase ?? ((await createServerSupabase()) as SupabaseClient);
  const { data, error } = await client.auth.getUser();
  return !error && data.user
    ? new AuthError(403, "forbidden")
    : new AuthError(401, "unauthenticated");
}

const MESSAGES = {
  unauthenticated: "Please sign in.",
  forbidden: "You do not have access to this.",
} as const;

/** Turns an AuthError into the shared JSON error response; null for any other error. */
export function authErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AuthError)) return null;
  return Response.json(
    { error: { code: error.code, message: MESSAGES[error.code] } },
    { status: error.status },
  );
}
