/**
 * Best-effort in-memory rate limiter (per server instance). It slows down
 * casual abuse of the sign-in endpoints; Supabase's own limits are the backstop.
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
