import "server-only";
import { shapeSaveTheDate } from "@/lib/calendar/details";
import { isoToPacificLocal } from "@/lib/admin/time";
import { log } from "@/lib/log";
import { isSmsConfigured } from "@/lib/sms/state";
import type { GuideState } from "./banner";
import { present, siteUrlOf, type EnvLike } from "./facts";
import { buildSetupView, type SetupView } from "./view";

/** The loosely typed slice of the Supabase client this needs (new tables are not in the generated types yet). */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseDb = {
  from: (table: string) => any;
  rpc: (...a: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

class ReadFailed extends Error {
  constructor(public readonly source: string) {
    super("setup_read_failed");
  }
}

async function read<T>(
  source: string,
  query: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new ReadFailed(source);
  return data;
}

type SettingsRow = {
  wedding_event_id: string | null;
  rsvp_open: boolean;
  default_rsvp_deadline: string | null;
  save_the_date_place: string | null;
  save_the_date_note: string | null;
  sms_enabled: boolean;
};

const LA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Works out the guide for one staff member from the live site: three reads in
 * parallel plus environment presence (never values). Returns null, after
 * logging only the failing read's name, if anything cannot be read, so the
 * page renders without a banner rather than breaking.
 */
export async function loadSetup(
  db: LooseDb,
  userId: string,
  role: "couple" | "planner",
  env: EnvLike = process.env,
): Promise<SetupView | null> {
  try {
    const [settings, details, events, state, confirmations] = await Promise.all(
      [
        read<SettingsRow>(
          "settings",
          db
            .from("settings")
            .select(
              "wedding_event_id, rsvp_open, default_rsvp_deadline, save_the_date_place, save_the_date_note, sms_enabled",
            )
            .maybeSingle(),
        ),
        db.rpc("get_save_the_date") as Promise<{
          data: unknown;
          error: unknown;
        }>,
        read<{ id: string; name: string; starts_at: string | null }[]>(
          "events",
          db.from("events").select("id, name, starts_at"),
        ),
        read<GuideState>(
          "setup_guide_state",
          db
            .from("setup_guide_state")
            .select("skipped_steps, last_step, left_guide, seen_required")
            .eq("user_id", userId)
            .maybeSingle(),
        ),
        read<{ step_key: string }[]>(
          "setup_confirmations",
          db.from("setup_confirmations").select("step_key"),
        ),
      ],
    );
    if (!settings) throw new ReadFailed("settings");
    if (details.error) throw new ReadFailed("get_save_the_date");

    const date = shapeSaveTheDate(details.data, "").date;
    const view = buildSetupView(
      {
        settings: {
          weddingEventId: settings.wedding_event_id,
          weddingEventDate: date,
          rsvpOpen: Boolean(settings.rsvp_open),
          defaultDeadline: settings.default_rsvp_deadline,
          place: settings.save_the_date_place?.trim() || null,
        },
        env: {
          siteUrl: siteUrlOf(env),
          emailKey: present(env.RESEND_API_KEY),
          emailFrom: present(env.EMAIL_FROM),
          linkKey: present(env.INVITE_LINK_SECRET),
          scheduleKey: present(env.CRON_SECRET),
          webhookKey: present(env.RESEND_WEBHOOK_SECRET),
        },
        sms: {
          configured: isSmsConfigured(env),
          enabled: Boolean(settings.sms_enabled),
        },
        confirmed: (confirmations ?? []).map((c) => c.step_key),
      },
      state,
      role,
      {
        events: (events ?? []).map((e) => ({
          id: e.id,
          name: e.name,
          date: e.starts_at ? LA_DATE.format(new Date(e.starts_at)) : null,
        })),
        note: settings.save_the_date_note ?? "",
        deadlineLocal: isoToPacificLocal(settings.default_rsvp_deadline),
      },
    );
    return view;
  } catch (error) {
    // Only the name of the failing read, never database text or a value.
    log.error("setup_read_failed", {
      code: error instanceof ReadFailed ? error.source : "unknown",
    });
    return null;
  }
}
