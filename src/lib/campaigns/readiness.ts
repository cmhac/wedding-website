import "server-only";
import { shapeSaveTheDate } from "@/lib/calendar/details";
import { getTemplate, type TemplateRegistry } from "@/lib/email/templates";
import { getText, type TextRegistry } from "@/lib/sms/texts";
import { emailConfigured } from "@/lib/setup/facts";
import { previewTextCost } from "./text-cost";
import type { LooseDb } from "./props";

/**
 * The save the date's readiness list (research R9): what is and is not set,
 * computed from live settings and the same registries the dispatcher checks, so
 * the list cannot disagree with the send. A "blocked" item stops the real send
 * with its reason; a "warn" item only warns. It reads only what the site holds:
 * it cannot see whether the email domain is verified at the provider, and says
 * so.
 */

export type ReadinessStatus = "ready" | "warn" | "blocked";
export type ReadinessItem = {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
};

export type ReadinessOptions = {
  channel: "email" | "text" | "both";
  siteUrl?: string;
  env?: Record<string, string | undefined>;
  templates?: TemplateRegistry;
  texts?: TextRegistry;
  sms?: { configured: boolean; enabled: boolean };
};

const item = (
  key: string,
  label: string,
  status: ReadinessStatus,
  detail: string,
): ReadinessItem => ({ key, label, status, detail });

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export async function loadReadiness(
  db: LooseDb,
  options: ReadinessOptions,
): Promise<ReadinessItem[]> {
  const wantsEmail = options.channel !== "text";
  const wantsText = options.channel !== "email";
  const siteUrl = (options.siteUrl ?? "").trim();
  const env = options.env ?? process.env;
  const sms = options.sms ?? { configured: false, enabled: false };

  const [
    { data: rawDetails },
    { data: settings },
    { data: households },
    { data: contacts },
  ] = await Promise.all([
    db.rpc("get_save_the_date") as Promise<{ data: unknown }>,
    db.from("settings").select("rsvp_open").maybeSingle() as Promise<{
      data: { rsvp_open?: boolean } | null;
    }>,
    db.from("households").select("id") as Promise<{
      data: { id: string }[] | null;
    }>,
    db
      .from("household_contacts")
      .select("household_id, kind, sms_consent") as Promise<{
      data:
        | { household_id: string; kind: string; sms_consent: string | null }[]
        | null;
    }>,
  ]);
  const details = shapeSaveTheDate(rawDetails, siteUrl);
  const items: ReadinessItem[] = [];

  items.push(
    details.date
      ? item("date", "Wedding date", "ready", "The wedding event has a date.")
      : item(
          "date",
          "Wedding date",
          "blocked",
          "The wedding date is not set. Choose the wedding event in Settings and give it a date.",
        ),
  );

  items.push(
    details.couple_names && details.place
      ? item(
          "details",
          "Card details",
          "ready",
          "The couple's names and the place are set.",
        )
      : item(
          "details",
          "Card details",
          "warn",
          "The place line or the couple's names are not set. Add them in Settings so the page, email, text and calendar match the printed card.",
        ),
  );

  if (!wantsEmail) {
    items.push(
      item(
        "email_template",
        "Email template",
        "ready",
        "Not needed: this send is text only.",
      ),
    );
  } else {
    try {
      getTemplate("save_the_date", options.templates);
      items.push(
        item(
          "email_template",
          "Email template",
          "ready",
          "A save the date email is registered.",
        ),
      );
    } catch {
      items.push(
        item(
          "email_template",
          "Email template",
          "blocked",
          "No save the date email is registered yet. The couple or the designer supply it; until then choose text only or wait.",
        ),
      );
    }
  }

  if (!wantsText) {
    items.push(
      item(
        "text_template",
        "Text wording",
        "ready",
        "Not needed: this send is email only.",
      ),
    );
  } else {
    try {
      getText("save_the_date", options.texts);
      const cost = previewTextCost("save_the_date", 1, siteUrl, options.texts);
      items.push(
        !cost || cost.segmentsPerText > 2
          ? item(
              "text_template",
              "Text wording",
              "warn",
              "The save the date text is longer than two segments.",
            )
          : item(
              "text_template",
              "Text wording",
              "ready",
              `The save the date text is registered (${cost.segmentsPerText} ${plural(cost.segmentsPerText, "segment", "segments")}).`,
            ),
      );
    } catch {
      items.push(
        item(
          "text_template",
          "Text wording",
          "blocked",
          "No save the date text is registered.",
        ),
      );
    }
  }

  items.push(
    siteUrl === ""
      ? item(
          "site_url",
          "Site address",
          "blocked",
          "The site's public address is not set, so links cannot be built.",
        )
      : siteUrl.startsWith("https://")
        ? item("site_url", "Site address", "ready", "The site address is set.")
        : item(
            "site_url",
            "Site address",
            "warn",
            "The site address is not https, so some phones and mail programs may warn about the links.",
          ),
  );

  items.push(
    settings?.rsvp_open === false
      ? item(
          "rsvp",
          "RSVP",
          "ready",
          "The RSVP is closed until invitations go out.",
        )
      : item(
          "rsvp",
          "RSVP",
          "warn",
          "The RSVP is open, so guests who sign in from the save the date could answer before invitations go out. Close it in Settings until invitations are sent, or leave it open on purpose.",
        ),
  );

  if (!wantsEmail) {
    items.push(
      item(
        "email_config",
        "Email sending",
        "ready",
        "Not needed: this send is text only.",
      ),
    );
  } else if (emailConfigured(env)) {
    items.push(
      item(
        "email_config",
        "Email sending",
        "ready",
        "The email key and sending address are set. This page cannot check that the sending domain is verified at the email provider: confirm that by hand (see the manual setup document).",
      ),
    );
  } else {
    items.push(
      item(
        "email_config",
        "Email sending",
        "blocked",
        "The email key or the sending address is not set.",
      ),
    );
  }

  if (!wantsText) {
    items.push(
      item(
        "texting",
        "Texting",
        "ready",
        "Not needed: this send is email only.",
      ),
    );
  } else if (sms.configured && sms.enabled) {
    items.push(
      item("texting", "Texting", "ready", "Texting is set up and switched on."),
    );
  } else {
    items.push(
      item(
        "texting",
        "Texting",
        "warn",
        sms.configured
          ? "Texting is switched off, so every text will be skipped."
          : "Texting is not set up, so every text will be skipped.",
      ),
    );
  }

  const email = new Set<string>();
  const text = new Set<string>();
  for (const c of contacts ?? []) {
    if (c.kind === "email") email.add(c.household_id);
    if (c.kind === "phone" && c.sms_consent === "opted_in")
      text.add(c.household_id);
  }
  const ids = (households ?? []).map((h) => h.id);
  const both = ids.filter((id) => email.has(id) && text.has(id)).length;
  const emailOnly = ids.filter((id) => email.has(id) && !text.has(id)).length;
  const textOnly = ids.filter((id) => !email.has(id) && text.has(id)).length;
  const neither = ids.filter((id) => !email.has(id) && !text.has(id)).length;
  items.push(
    item(
      "reach",
      "Who this reaches",
      neither > 0 ? "warn" : "ready",
      `${both} by email and text, ${emailOnly} by email only, ${textOnly} by text only, ${neither} by neither${neither > 0 ? " (they depend on the post)" : ""}.`,
    ),
  );

  return items;
}

/** The first item that stops the real send, or null. */
export function firstBlocked(items: ReadinessItem[]): ReadinessItem | null {
  return items.find((i) => i.status === "blocked") ?? null;
}
