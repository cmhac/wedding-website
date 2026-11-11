// Text wording registry, mirroring emails/index.ts. Registered here: the sign-in
// text, the opt-in confirmation and the campaign texts that have wording.
// A campaign type with no text here is refused before anything is queued.
// First drafts for Chris to polish; see specs/005-sms-support/contracts/text-templates.md.
import invitation from "./invitation";
import optionalEventsReminder from "./optional-events-reminder";
import rsvpReminder from "./rsvp-reminder";
import smsConfirmation from "./sms-confirmation";
import saveTheDate from "./save-the-date";
import smsSignIn from "./sms-sign-in";
import update from "./update";

export type TextTemplate<P> = (props: P) => string;

const registry = {
  sms_sign_in: smsSignIn,
  sms_confirmation: smsConfirmation,
  save_the_date: saveTheDate,
  invitation,
  rsvp_reminder: rsvpReminder,
  update,
  optional_events_reminder: optionalEventsReminder,
};

export default registry;
