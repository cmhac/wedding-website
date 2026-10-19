import { buildCampaignProps, type CampaignProps } from "@/lib/email/templates";

/**
 * Loads the data a campaign template receives for one household and passes it
 * through `buildCampaignProps`, which picks only the contract fields (so no
 * email address, postal address, dietary data or notes can reach a template).
 *
 * Reads the pending counts from the `household_rsvp_progress` view and the
 * household's invitations and events from their tables. Needs a service-role
 * client; the view's column names are listed in `ProgressRow` below.
 */

/** The loosely typed slice of the Supabase client this module needs. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type LooseDb = {
  from: (table: string) => any;
  rpc: (...a: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

type ProgressRow = {
  pending_required_events: number | null;
  pending_optional_events: number | null;
  pending_meals: number | null;
};

type EventRow = {
  id: string;
  slug: string;
  name: string;
  starts_at: string | null;
  venue_name: string | null;
  is_required: boolean;
  rsvp_deadline: string | null;
  display_order: number | null;
};

type InvitationRow = { guest_id: string; event_id: string; status: string };

export type PropsOptions = {
  siteUrl: string;
  rsvpPath?: string;
  /** The current time, for deciding which deadlines are still open. */
  now?: Date;
};

type EventStatus = CampaignProps["events"][number]["status"];

function overallStatus(statuses: string[]): EventStatus {
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("attending")) return "attending";
  return "declined";
}

/** Returns null when the household does not exist. */
export async function loadCampaignProps(
  db: LooseDb,
  householdId: string,
  options: PropsOptions,
): Promise<CampaignProps | null> {
  const now = options.now ?? new Date();

  const { data: household } = await db
    .from("households")
    .select("display_name, rsvp_deadline_override")
    .eq("id", householdId)
    .maybeSingle();
  if (!household) return null;

  const [{ data: progress }, { data: guests }, { data: settings }] =
    await Promise.all([
      db
        .from("household_rsvp_progress")
        .select(
          "pending_required_events, pending_optional_events, pending_meals",
        )
        .eq("household_id", householdId)
        .maybeSingle() as Promise<{ data: ProgressRow | null }>,
      db
        .from("guests")
        .select("id")
        .eq("household_id", householdId) as Promise<{
        data: { id: string }[] | null;
      }>,
      db
        .from("settings")
        .select("default_rsvp_deadline")
        .maybeSingle() as Promise<{
        data: { default_rsvp_deadline: string | null } | null;
      }>,
    ]);

  const guestIds = (guests ?? []).map((g) => g.id);
  const { data: invitations } = guestIds.length
    ? ((await db
        .from("invitations")
        .select("guest_id, event_id, status")
        .in("guest_id", guestIds)) as { data: InvitationRow[] | null })
    : { data: [] as InvitationRow[] };

  const eventIds = [...new Set((invitations ?? []).map((i) => i.event_id))];
  const { data: events } = eventIds.length
    ? ((await db
        .from("events")
        .select(
          "id, slug, name, starts_at, venue_name, is_required, rsvp_deadline, display_order",
        )
        .in("id", eventIds)) as { data: EventRow[] | null })
    : { data: [] as EventRow[] };

  const sorted = [...(events ?? [])].sort(
    (a, b) =>
      (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
      (a.display_order ?? 0) - (b.display_order ?? 0),
  );

  const mapped = sorted.map((event) => ({
    event,
    status: overallStatus(
      (invitations ?? [])
        .filter((i) => i.event_id === event.id)
        .map((i) => i.status),
    ),
  }));

  // The deadline that applies is the household's override, else the event's,
  // else the site default. Only unanswered events with a future deadline count.
  const open = mapped
    .filter((m) => m.status === "pending")
    .map(
      (m) =>
        household.rsvp_deadline_override ??
        m.event.rsvp_deadline ??
        settings?.default_rsvp_deadline ??
        null,
    )
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d))
    .filter((d) => d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return buildCampaignProps({
    household: { display_name: household.display_name },
    events: mapped.map(({ event, status }) => ({
      slug: event.slug,
      name: event.name,
      // The contract types these as strings; an unscheduled event or unnamed
      // venue arrives as an empty string.
      starts_at: event.starts_at ?? "",
      venue_name: event.venue_name ?? "",
      is_required: event.is_required,
      status,
    })),
    respond_by: open[0]?.toISOString() ?? null,
    pending: {
      required_events: progress?.pending_required_events ?? 0,
      optional_events: progress?.pending_optional_events ?? 0,
      meals: progress?.pending_meals ?? 0,
    },
    siteUrl: options.siteUrl,
    rsvpPath: options.rsvpPath,
  });
}
