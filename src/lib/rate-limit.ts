/**
 * The caller's address for rate limiting. `x-real-ip` is set by the hosting
 * platform; failing that, the rightmost `x-forwarded-for` hop is the one our
 * own proxy appended. The leftmost hop is whatever the caller sent, so it is
 * never trusted. Returns "unknown" when neither header is usable.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? "unknown";
}

/**
 * Best-effort in-memory rate limiter (per server instance, so it resets on a
 * restart and is not shared between instances). It slows down casual abuse of
 * the sign-in endpoints; Supabase's own per-email limit is the real control
 * (see docs/manual-setup.md).
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    /** Records an attempt and returns true if it is within the limit. */
    check(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter(
        (at) => t - at < options.windowMs,
      );
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (v.every((at) => t - at >= options.windowMs)) hits.delete(k);
        }
      }
      return true;
    },
  };
}
