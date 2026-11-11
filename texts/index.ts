// Text wording registry, mirroring emails/index.ts. Registered here: the sign-in
// text, the opt-in confirmation and the campaign texts that have wording.
// `invitation` and `save_the_date` have no text on purpose: the first contact is
// always an email, and choosing text for them is refused before anything is queued.
// First drafts for Chris to polish; see specs/005-sms-support/contracts/text-templates.md.
import optionalEventsReminder from "./optional-events-reminder";
import rsvpReminder from "./rsvp-reminder";
import smsConfirmation from "./sms-confirmation";
import smsSignIn from "./sms-sign-in";
import update from "./update";

export type TextTemplate<P> = (props: P) => string;

const registry = {
  sms_sign_in: smsSignIn,
  sms_confirmation: smsConfirmation,
  rsvp_reminder: rsvpReminder,
  update,
  optional_events_reminder: optionalEventsReminder,
};

export default registry;
