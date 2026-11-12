/**
 * The setup guide's step catalogue (specs/007-admin-setup-guide, contracts/
 * setup-guide.md). Pure data and plain wording, no I/O. Whether a step is done
 * is worked out elsewhere (`status.ts`) and never stored.
 */

export type StepGroup = "required" | "recommended";
/** console: set in the guide itself; outside: set in hosting; manual: confirmed by hand. */
export type StepKind = "console" | "outside" | "manual";
/** Which small form a console step shows inside the guide. */
export type StepForm = "event" | "card" | "deadline" | "rsvp" | "sms";

export type StepDef = {
  key: string;
  label: string;
  group: StepGroup;
  kind: StepKind;
  /** What it is for, in plain words. */
  purpose: string;
  /** What happens if it stays unset. */
  ifUnset: string;
  /** Names of the hosting values to set (names only, never values). */
  envNames?: string[];
  form?: StepForm;
  /** Only the couple may change it (the texting switch). */
  coupleOnly?: boolean;
  /** Where to set it, for steps set outside the console. */
  where?: string;
};

const HOSTING = "your hosting project, Settings, Environment Variables";

export const STEPS: readonly StepDef[] = [
  {
    key: "site_url",
    label: "Site address",
    group: "required",
    kind: "outside",
    purpose:
      "The site's public web address. Every link in an email, text and calendar entry is built from it.",
    ifUnset: "Links cannot be built, so no message can be sent.",
    envNames: ["NEXT_PUBLIC_SITE_URL"],
    where: HOSTING,
  },
  {
    key: "wedding_event",
    label: "Wedding event",
    group: "required",
    kind: "console",
    form: "event",
    purpose:
      "Guests' personal links stop working on this event's date. It also supplies the date on the save the date page, email and calendar entry.",
    ifUnset: "Links never close and the save the date has no date.",
  },
  {
    key: "email_sending",
    label: "Email sending",
    group: "required",
    kind: "outside",
    purpose:
      "Sign-in links, invitations and the save the date go out by email through your email provider.",
    ifUnset: "No email can be sent.",
    envNames: ["RESEND_API_KEY", "EMAIL_FROM"],
    where: HOSTING,
  },
  {
    key: "link_key",
    label: "Personal link key",
    group: "required",
    kind: "outside",
    purpose:
      "A long random string that signs every guest's personal link. Set it once, before invitations go out: changing it breaks every link already sent.",
    ifUnset: "Personal links cannot be made.",
    envNames: ["INVITE_LINK_SECRET"],
    where: HOSTING,
  },
  {
    key: "schedule_key",
    label: "Scheduled sending key",
    group: "required",
    kind: "outside",
    purpose:
      "A secret the scheduler uses to prove a scheduled send is really yours.",
    ifUnset: "Scheduled sends never run.",
    envNames: ["CRON_SECRET"],
    where: HOSTING,
  },
  {
    key: "card_details",
    label: "Place line and note",
    group: "recommended",
    kind: "console",
    form: "card",
    purpose:
      "The place line and note printed on the save the date card, so the page, email, text and calendar entry match it.",
    ifUnset: "The save the date shows the date without a place.",
  },
  {
    key: "rsvp_deadline",
    label: "Default RSVP deadline",
    group: "recommended",
    kind: "console",
    form: "deadline",
    purpose:
      "The date guests are asked to reply by, unless an event has its own.",
    ifUnset: "Guests see no reply-by date.",
  },
  {
    key: "rsvp_closed",
    label: "Close the RSVP until invitations go out",
    group: "recommended",
    kind: "console",
    form: "rsvp",
    purpose:
      "Guests who sign in from the save the date could otherwise answer before invitations are sent.",
    ifUnset: "Guests can answer the RSVP early.",
  },
  {
    key: "texting",
    label: "Texting",
    group: "recommended",
    kind: "outside",
    form: "sms",
    coupleOnly: true,
    purpose:
      "Texts a link to guests who have agreed to receive them. It needs the text provider's values in hosting and the couple's switch turned on.",
    ifUnset: "Texts are skipped. Email and invitations still work.",
    envNames: [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_MESSAGING_SERVICE_SID",
    ],
    where: HOSTING,
  },
  {
    key: "email_tracking",
    label: "Email delivery tracking",
    group: "recommended",
    kind: "outside",
    purpose:
      "Lets the email provider tell the site when a message is delivered or bounces.",
    ifUnset: "Delivery status stays unknown.",
    envNames: ["RESEND_WEBHOOK_SECRET"],
    where: HOSTING,
  },
  {
    key: "sending_domain",
    label: "Sending domain verified",
    group: "recommended",
    kind: "manual",
    purpose:
      "Your email provider must have verified the domain you send from. The site cannot check this, so confirm it by hand once it is done.",
    ifUnset: "Emails may be rejected or land in spam.",
  },
];

export const REQUIRED_KEYS: readonly string[] = STEPS.filter(
  (s) => s.group === "required",
).map((s) => s.key);

export function stepByKey(key: string): StepDef | undefined {
  return STEPS.find((s) => s.key === key);
}
