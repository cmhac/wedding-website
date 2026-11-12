import { SAVE_THE_DATE_PATH } from "@/lib/auth/destination";
import type { SessionKind } from "@/lib/auth/session";

/**
 * Where sign-in routes send people. Shared by `/auth/callback` (staff),
 * `/auth/confirm` (a typed-address link) and `/i/[token]` (a personal link), so
 * the same rules apply to every way of signing in.
 */

/** Where a failed or unusable link lands; served by whoever builds the screens. */
export const FAILURE_PATH = "/auth/error";
export const ADMIN_PATH = "/admin";
// The placeholder homepage until the designer builds the RSVP page; set
// GUEST_RSVP_PATH to send guests elsewhere.
const DEFAULT_GUEST_PATH = "/";

export function guestPath(): string {
  return process.env.GUEST_RSVP_PATH || DEFAULT_GUEST_PATH;
}

/**
 * A `next` value is honored only if it is a plain relative path under one of
 * the fixed prefixes the signed-in kind may visit. Anything else is ignored.
 */
export function allowedNext(
  next: string | null,
  kind: SessionKind,
): string | null {
  if (!next || !/^\/[A-Za-z0-9/_-]*$/.test(next) || next.includes("//")) {
    return null;
  }
  // The save the date page is the one other landing a message may ask for.
  if (next === SAVE_THE_DATE_PATH) return next;
  const prefixes = kind === "staff" ? [ADMIN_PATH, guestPath()] : [guestPath()];
  const ok = prefixes.some((p) => next === p || next.startsWith(`${p}/`));
  return ok ? next : null;
}

/** A 302 to a path on the site. Sign-in responses are never cached or indexed. */
export function redirectTo(path: string): Response {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(path, base).toString(),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
