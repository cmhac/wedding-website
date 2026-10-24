import { createHash, timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/api-errors";
import { dispatchDueCampaigns } from "@/lib/campaigns/dispatch";
import { log } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Compares secrets in constant time. Hashing first makes the lengths equal. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * POST /api/internal/dispatch-scheduled: called every 5 minutes by `pg_cron`
 * through `pg_net`. Sends campaigns that are due and records the run time.
 * Repeating a run changes nothing.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !provided || !secretMatches(provided, expected)) {
    log.warn("dispatch_scheduled", { outcome: "unauthorized" });
    return errorResponse(401, "unauthenticated", "Not authorised.");
  }

  try {
    const { campaigns } = await dispatchDueCampaigns(createAdminSupabase());
    return Response.json({
      campaigns: campaigns.map((c) =>
        c.ok
          ? { campaign_id: c.campaign_id, ok: true }
          : { campaign_id: c.campaign_id, ok: false, code: c.code },
      ),
    });
  } catch {
    log.error("dispatch_scheduled", { outcome: "failed" });
    return errorResponse(500, "server_error", "The dispatch failed.");
  }
}
