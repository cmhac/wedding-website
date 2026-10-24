/**
 * Template interface and registry lookup (contracts/email-templates.md).
 * Email content is supplied separately and registered in `emails/index.ts`;
 * nothing here contains copy, subjects or designs.
 */
import registry from "../../../emails";

export type RenderedEmail = { subject: string; html: string; text: string };

export type EmailTemplate<P> = (
  props: P,
) => RenderedEmail | Promise<RenderedEmail>;

export type MagicLinkProps = {
  sign_in_url: string;
  audience: "guest" | "staff";
};

export type CampaignProps = {
  household: { display_name: string };
  rsvp_url: string;
  respond_by: string | null;
  events: {
    slug: string;
    name: string;
    starts_at: string | null;
    venue_name: string | null;
    is_required: boolean;
    status: "pending" | "attending" | "declined";
  }[];
  pending: { required_events: number; optional_events: number; meals: number };
};

export type TemplateKey =
  | "magic_link"
  | "save_the_date"
  | "invitation"
  | "rsvp_reminder"
  | "optional_events_reminder"
  | "update";

export type TemplateErrorCode = "template_missing" | "template_failed";

export class TemplateError extends Error {
  constructor(
    public readonly code: TemplateErrorCode,
    public readonly key: string,
  ) {
    super(code);
    this.name = "TemplateError";
  }
}

export type TemplateRegistry = Record<string, EmailTemplate<never> | undefined>;

export function getTemplate(
  key: string,
  templates: TemplateRegistry = registry as TemplateRegistry,
): EmailTemplate<unknown> {
  const template = Object.prototype.hasOwnProperty.call(templates, key)
    ? templates[key]
    : undefined;
  if (typeof template !== "function") {
    throw new TemplateError("template_missing", key);
  }
  return template as EmailTemplate<unknown>;
}

/** Looks up and runs a template. A throwing template becomes `template_failed`. */
export async function renderTemplate(
  key: string,
  props: unknown,
  templates?: TemplateRegistry,
): Promise<RenderedEmail> {
  const template = getTemplate(key, templates);
  try {
    const rendered = await template(props);
    if (
      !rendered ||
      typeof rendered.subject !== "string" ||
      typeof rendered.html !== "string" ||
      typeof rendered.text !== "string"
    ) {
      throw new Error("invalid result");
    }
    return rendered;
  } catch {
    // Deliberately drop the cause: it could contain personal data.
    throw new TemplateError("template_failed", key);
  }
}

export type CampaignPropsSource = {
  household: { display_name: string };
  events: (CampaignProps["events"][number] & Record<string, unknown>)[];
  respond_by: string | null;
  pending: CampaignProps["pending"];
  siteUrl: string;
  rsvpPath?: string;
};

/**
 * Builds campaign props by picking only the contract fields, so an email
 * address, postal address, dietary data or notes can never reach a template
 * even if the source object carries them.
 */
export function buildCampaignProps(source: CampaignPropsSource): CampaignProps {
  const base = source.siteUrl.replace(/\/+$/, "");
  return {
    household: { display_name: source.household.display_name },
    rsvp_url: `${base}${source.rsvpPath ?? "/rsvp"}`,
    respond_by: source.respond_by,
    events: source.events.map((e) => ({
      slug: e.slug,
      name: e.name,
      starts_at: e.starts_at,
      venue_name: e.venue_name,
      is_required: e.is_required,
      status: e.status,
    })),
    pending: {
      required_events: source.pending.required_events,
      optional_events: source.pending.optional_events,
      meals: source.pending.meals,
    },
  };
}
