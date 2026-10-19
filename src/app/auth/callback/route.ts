import { createServerSupabase } from "@/lib/supabase/server";
import { getSession, type SessionKind } from "@/lib/auth/session";

/** Where a failed or unusable link lands; served by whoever builds the screens. */
export const FAILURE_PATH = "/auth/error";

const ADMIN_PATH = "/admin";
const DEFAULT_GUEST_PATH = "/rsvp";

function guestPath() {
  return process.env.GUEST_RSVP_PATH || DEFAULT_GUEST_PATH;
}

/**
 * A `next` value is honored only if it is a plain relative path under one of
 * the fixed prefixes the signed-in kind may visit. Anything else is ignored.
 */
function allowedNext(next: string | null, kind: SessionKind): string | null {
  if (!next || !/^\/[A-Za-z0-9/_-]*$/.test(next) || next.includes("//")) {
    return null;
  }
  const prefixes = kind === "staff" ? [ADMIN_PATH, guestPath()] : [guestPath()];
  const ok = prefixes.some((p) => next === p || next.startsWith(`${p}/`));
  return ok ? next : null;
}

function redirect(path: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  return Response.redirect(new URL(path, base), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return redirect(FAILURE_PATH);

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect(FAILURE_PATH);

    const session = await getSession();
    if (!session) return redirect(FAILURE_PATH);

    const fallback = session.kind === "staff" ? ADMIN_PATH : guestPath();
    return redirect(
      allowedNext(url.searchParams.get("next"), session.kind) ?? fallback,
    );
  } catch {
    return redirect(FAILURE_PATH);
  }
}
