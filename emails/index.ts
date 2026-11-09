// Template registry. Email content is supplied separately; add templates here
// keyed by template key. See specs/001-guest-data-model/contracts/email-templates.md.
//
// First drafts of `magic_link`, `invitation` and `rsvp_reminder` are written
// under the couple's dated permission in CLAUDE.md, for Chris to polish. Other
// keys (save_the_date, optional_events_reminder, update) stay unregistered and
// keep refusing to send.
import type { EmailTemplate } from "../src/lib/email/templates";
import invitation from "./invitation";
import magicLink from "./magic-link";
import rsvpReminder from "./rsvp-reminder";

export default {
  magic_link: magicLink,
  invitation,
  rsvp_reminder: rsvpReminder,
} satisfies Record<string, EmailTemplate<never>>;
