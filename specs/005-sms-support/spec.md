# Feature Specification: Text messages as a first-class way to sign in and be messaged

**Feature Branch**: `005-sms-support` (work happens on the session branch; the spec directory name does not dictate it)

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description (2026-11-10): "We previously deferred sms setup. I want to go ahead and get started on that now ... build a new spec for full sms support. sms should be a first class login method, equal to email."

This feature picks up the "Deferred: text messages" section of the personal invite links spec ([`specs/003-personal-invite-links/spec.md`](../003-personal-invite-links/spec.md)), whose decisions carry over unchanged unless this spec says otherwise. It also builds on the placeholder homepage spec ([`specs/004-placeholder-homepage/spec.md`](../004-placeholder-homepage/spec.md)), whose sign-in prompt is the guest's front door.

## Clarifications

### Session 2026-11-10

- Q: What does "equal to email" mean? → A: Anything a guest or the couple can do through an email address, they can do through a phone number, with the same rules, the same neutral answers and the same limits. A household reachable only by phone is a complete household, not a second-class one. Staff are the one exception: they keep signing in by email (carried over from the invite links spec).
- Q: Which earlier decisions carry over? → A: All of "Deferred: text messages" in the invite links spec: United States numbers only; the same link as email rather than a typed code; campaigns by email, text or both; no consent tracking, relying on the provider's standard STOP, START and HELP handling; one on/off switch for texts, off until the provider is set up; sign-in texts from templates kept in the repository, with first-draft wording written here.
- Q: Is a one-time code (typed in from the text) offered as well? → A: No. A text carries a link, exactly as an email does.

## Background

Today a household is reached by zero or more email addresses. A guest signs in by opening the personal link in an invitation email, or by typing one of the household's email addresses to be sent a short-lived link. Campaigns go out as one email per address. The data was designed so that a phone number could later be added as a second kind of contact without reworking it, and that is what this feature does.

Plain-language terms used below:

- **Household**, **personal invite link**, **sign-in link**, **campaign**, **paper only**: as in the invite links spec. Paper only now means a household with no email address and no phone number.
- **Contact**: one way to reach a household: an email address or a phone number.
- **Text**: an SMS text message sent to a phone number.
- **Channel**: email or text.
- **Opted out of texts (STOP)**: a recipient who replied STOP, or an equivalent word, to the couple's texting number. The provider then refuses further texts to that person from that number until they reply START.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest signs in by opening the link in their invitation text (Priority: P1)

The couple import the guest list, including phone numbers, and send invitations by text. A guest taps their household's personal link in the text and is signed in to their household straight away, with no sign-up, password or code. They stay signed in on that device, exactly as with an emailed link.

**Why this priority**: for guests with a phone number and no email, this is the only way in, and for many others it is the easiest.

**Independent Test**: import a household with one phone number and no email, send it an invitation by text, open the link from the text on two devices, and reach that household and nothing else.

**Acceptance Scenarios**:

1. **Given** a household with only a phone number that has been sent an invitation text, **When** a guest opens the link, **Then** they are signed in as that household.
2. **Given** the same link, **When** it is opened on a second device or weeks later, **Then** it signs in again, and the first device stays signed in.
3. **Given** a link the couple have reissued, a made-up link, or any link on or after the wedding day, **When** anyone opens it, **Then** the same plain failure page appears as for an emailed link.
4. **Given** the RSVP deadline has passed, **When** a guest opens the link from a text, **Then** they behave exactly as with an emailed link (they see their answers, are told the deadline has passed, and cannot change them).
5. **Given** a household that has both an email address and a phone number, **When** its personal link is opened from either, **Then** both reach the same household and the same RSVP.

---

### User Story 2 - Guest asks for a sign-in link by typing their phone number (Priority: P1)

A guest on a new device, or who has lost the invitation, types their phone number into the same sign-in prompt where they would type an email address, and receives a short-lived sign-in link by text. Opening it signs them in, with the same access as the personal link.

**Why this priority**: it is the phone-number half of "equal to email", and without it a text-only guest who loses their invitation is locked out.

**Independent Test**: with a household that has one email address and one phone number, ask for a link by each and open each; both reach the same household. Ask for a link for an unknown number and confirm the answer is identical.

**Acceptance Scenarios**:

1. **Given** a phone number on a household, **When** a guest types it in any common way (with or without spaces, dashes, brackets, the leading 1 or +1), **Then** a link is texted to that number only, and opening it signs them in to the household.
2. **Given** a link that has expired or been used, **When** it is opened, **Then** the guest lands on the plain failure page and can ask for another.
3. **Given** a number that is on no household, a number outside the United States, or text sending switched off, **When** someone asks for a link, **Then** they get exactly the same on-screen answer, taking the same time, as for a known number, and nothing is sent and no account is created.
4. **Given** one sign-in prompt, **When** a visitor types an email address or a phone number, **Then** the prompt works out which it is, with no channel picker, and either way the on-screen answer is the same wording.
5. **Given** a household member who is texting-blocked at the provider because they replied STOP, **When** they ask for a link by text, **Then** the on-screen answer is still the neutral one, and the guest can instead use their email address, their personal link, or reply START (the guest interface documentation says so).

---

### User Story 3 - Couple manages households' phone numbers (Priority: P1)

The couple and the planner add, change and remove a household's phone numbers, in the household form and in the guest-list spreadsheet import, alongside email addresses. A household can have any number of each; any one contact is enough.

**Why this priority**: nothing else works until numbers are on file, and a wrong number sends a guest's link to a stranger.

**Independent Test**: create a household with one email and two phone numbers, edit and remove one number, then import a spreadsheet with good, invalid, non-US, repeated and differently formatted numbers and check the per-row, per-column errors and the counts shown.

**Acceptance Scenarios**:

1. **Given** a phone number already on another household, **When** staff save, **Then** it is refused with a plain message that it is already in use, even if the two were typed in different formats.
2. **Given** a number that is not a valid United States number (including Canadian and other +1 numbers outside the United States, or one that is too short or too long), **When** staff save or import it, **Then** it is refused with a plain message that only United States numbers are supported and the household can use email instead.
3. **Given** an import file with several phone columns per household, **When** it is imported, **Then** valid numbers are saved in one standard form, and invalid or repeated ones are reported by row and column, with the rest of that household skipped as for other bad rows.
4. **Given** staff remove a household's last contact of either kind, **When** they save, **Then** they are warned it becomes paper only and nobody in it can sign in.
5. **Given** staff remove a phone number, **When** its owner later asks for a sign-in link by that number, **Then** nothing is sent and they get the neutral answer; the household's other contacts are unaffected.
6. **Given** the household list and detail, **When** staff view them, **Then** they see how many emails and how many phone numbers each household has, and which are paper only.

---

### User Story 4 - Couple sends invitations and reminders by email, text or both (Priority: P1)

When the couple send a campaign, they choose email, text or both. Each household in the audience receives the message on every contact of the chosen channel(s), once per contact, and each message carries the household's personal link. The audience filters and the preview work as today, now counting messages by channel.

**Why this priority**: it is how text-only households get their invitation at all.

**Independent Test**: with households that have only emails, only phones, both, and neither, send a campaign by "both" and confirm each contact got exactly one message on its own channel, and each household with no matching contact is listed as skipped with a reason. Repeat with "text" and "email" alone.

**Acceptance Scenarios**:

1. **Given** a campaign sent by both channels, **When** it goes out, **Then** every email address gets exactly one email and every phone number gets exactly one text, each with the household's personal link.
2. **Given** the preview, **When** staff open it, **Then** each household shows how many emails and how many texts it will receive, each skipped household shows why (paper only, no contact on the chosen channel, reminders opted out for a non-essential type, text sending switched off, or already responded where the filter applies), and the totals are shown per channel.
3. **Given** a campaign that has already been sent, **When** it is retried or run again, **Then** no contact receives a second copy.
4. **Given** a message type with no registered text wording, **When** staff choose text or both for it, **Then** the send is refused with a plain message and nothing goes out on either channel (as for a missing email template today).
5. **Given** a household that opted out of reminders, **When** a reminder goes out by any channel, **Then** it is excluded, but an essential logistics update still goes to it.
6. **Given** a large text campaign, **When** it is sent, **Then** it is paced so that the provider's limits for the couple's registration are not exceeded, continues until every text has been sent or has failed, and does not delay sign-in texts that guests are waiting for.
7. **Given** a campaign scheduled for a later time by text, **When** the time arrives, **Then** it sends by the same rules, and a campaign scheduled before text sending is switched on sends only its emails (the texts are listed as skipped, not silently dropped).

---

### User Story 5 - Sign-in and campaign texts come from the repository's own wording (Priority: P2)

Every text the site sends (the sign-in link text, the invitation, the reminder) is rendered from wording registered in this repository and sent by this repository's code. This feature writes first-draft wording, which the couple polish later.

**Why this priority**: required for P1 stories to send anything, but the wording itself is quick to replace.

**Independent Test**: with the sign-in text registered, ask for a link by phone and confirm the text is built from the registered wording. With it removed, confirm nothing is sent and the guest still sees the neutral answer.

**Acceptance Scenarios**:

1. **Given** registered wording for a message type, **When** a text of that type is sent, **Then** it is built from that wording and the household's link.
2. **Given** missing or failing wording, **When** a text is attempted, **Then** nothing is sent, the guest still sees the neutral answer, and the failure is logged without any phone number.
3. **Given** the first-draft wording, **When** a text is sent, **Then** it names the couple's wedding site and says plainly who it is from, includes the link, and fits in a single standard text segment where the link allows, so guests are not sent several fragments.

---

### User Story 6 - Couple switches texting on, sees it working, and tracks delivery per number (Priority: P2)

Text sending is off until the couple have set up the provider. One switch in the admin console turns it on; with it off, phone numbers can still be saved but no text is sent. Once on, each text is recorded per phone number with its delivery status, and a failed text, including one refused because the recipient replied STOP, flags that number and its household for follow-up.

**Why this priority**: it keeps a half-finished setup from sending anything and makes sends accountable.

**Independent Test**: with the switch off, send a "both" campaign and confirm only emails go out and the texts are listed as skipped. Turn it on, send to a household with two numbers, report a failure for one, and confirm that number and household are flagged but the other number is not.

**Acceptance Scenarios**:

1. **Given** the switch is off, **When** anyone asks for a sign-in link by phone or a campaign includes text, **Then** no text is sent, the sign-in answer is the neutral one, and the console shows plainly that texting is off.
2. **Given** a text that failed (undeliverable number, landline, carrier rejection, or the recipient opted out), **When** the status arrives, **Then** that number and its household are flagged, the console shows which number failed and why in plain words, and the other contacts are not flagged.
3. **Given** the same delivery status twice, or a later one before an earlier one, **When** they are processed, **Then** the record ends in the correct state (as for email).
4. **Given** a flagged number, **When** it is corrected or removed, **Then** the flag clears.
5. **Given** a guest who replied STOP and later replies START, **When** staff retry the text, **Then** it is delivered like any other (the site does not keep its own opt-out list).

---

### Edge Cases

- A number typed with extra characters, letters, an extension, or an international prefix other than +1: normalized if it is clearly a United States number, otherwise refused with the same plain message. Never guessed at.
- A landline or other number that cannot receive texts: the site cannot tell in advance, so it counts as a failed delivery, not a rejection at entry.
- Two households that share a home phone: a number belongs to only one household, so the couple list it once, or give the second household a different number (the same rule as for email).
- A household's only contact is a phone number and it is removed: the household becomes paper only, with the usual warning.
- A staff member's own phone number is also a household number: allowed. Staff sign in only by email, so there is nothing to collide with, and staff addresses still cannot be household email addresses.
- Someone asks for many sign-in texts, for their own numbers or ones they do not own: limits per number and overall stop abuse and cost, without changing the neutral answer. Because unknown numbers are never texted, no text can be triggered to an arbitrary number.
- A text link is opened first by a messaging app's automatic link preview rather than by the guest, which would use up a single-use typed-number sign-in link: the guest asks again or uses the personal link, which is not used up. The plan decides whether this needs more than that and checks it against how the leading phone messaging apps behave.
- A guest replies HELP, STOP or START: the provider handles the standard reply. Other replies from guests are not read by the site; the guest interface documentation tells guests to contact the couple.
- A guest has changed phone numbers: staff replace the number; the old number stops working for sign-in at once.
- A household is deleted: all its phone numbers and text records are removed or irreversibly anonymised under the same rule as email addresses.
- The wedding day arrives: personal links stop, texted or emailed alike; typed-number sign-in links keep working, as typed-address links do.
- Provider outage or credentials missing while the switch is on: texts fail and are flagged as failed deliveries, sign-in still gives the neutral answer, and the failure is logged without any phone number.

## Requirements _(mandatory)_

### Functional Requirements

**Phone numbers as contacts**

- **FR-001**: A household MUST be able to have zero or more phone numbers alongside zero or more email addresses. Any one contact of either kind is enough to be reachable and to sign in; no contact means paper only.
- **FR-002**: Only United States phone numbers MUST be accepted. Other +1 numbers (including Canada) and malformed numbers MUST be refused with a plain message pointing the couple to email instead.
- **FR-003**: Every phone number MUST be stored in one standard form, so that the same number typed in different formats is recognised as the same. A number MUST belong to at most one household. A repeat MUST be refused with a plain message.
- **FR-004**: Only the couple and the planner MUST be able to add, change and remove a household's phone numbers; guests MUST NOT, though a signed-in guest MAY see their own household's numbers, masked as email addresses are. The guest-list import MUST accept several phone columns per household, with per-row, per-column errors, in both spreadsheet formats it already accepts. Removing the last contact of any kind MUST warn that the household becomes paper only. Removing a number MUST stop it being used to ask for a sign-in link immediately.
- **FR-005**: The data design MUST keep email and phone numbers as the same kind of thing (a contact with a channel), so that every rule below applies to both without a parallel copy of the machinery.

**Signing in**

- **FR-006**: A personal invite link MUST work identically whether it arrived by email or by text: same expiry, same reissue behavior, same effect on every device, same failure page, same RSVP-deadline behavior. Nothing about it is specific to a channel.
- **FR-007**: A guest MUST be able to ask for a short-lived sign-in link by typing any one phone number of their household, and the link MUST be texted only to the number typed and MUST sign in to the same household as the personal link.
- **FR-008**: The sign-in prompt MUST accept an email address or a phone number in one field and decide which it is, without a channel picker. An address that is not an email and not a recognisable phone number MUST get the same neutral answer as an unknown one.
- **FR-009**: Asking for a link by phone MUST never create an account and MUST never reveal whether a number is on the guest list. The answer, status, wording and response time MUST be the same for known numbers, unknown numbers, non-US numbers, numbers over their limits, and when texting is off. The wording MUST cover both channels, so it never shows which kind was typed.
- **FR-010**: The system MUST limit sign-in link requests per phone number and overall, without changing the neutral answer, with the same mechanism and the same settings-without-code-changes as for email. Limits MUST be tracked without storing the number itself. A flood of requests MUST NOT be able to cause texts to anyone not already on a household.
- **FR-011**: Staff sign-in MUST stay on email links. Staff do not sign in by phone.
- **FR-012**: A guest who has signed in by any route (email link, text link, personal link) MUST stay signed in on that device indefinitely, under exactly the rules in the invite links spec, whichever channel the link came by. "Sign out everywhere" and reissuing the link MUST apply to a household regardless of channel.

**Campaigns and messages**

- **FR-013**: A campaign MUST let staff choose email, text, or both. Each household in the audience MUST receive exactly one message per contact on the chosen channel(s). All existing audience filters MUST work unchanged.
- **FR-014**: Invitation and reminder wording for texts MUST be given the household's personal link. A send MUST remain idempotent per contact: re-running or retrying MUST NOT send any contact a second copy, on either channel.
- **FR-015**: The existing reminder opt-out MUST apply to a household across both channels: non-essential types are excluded; essential logistics updates are still sent.
- **FR-016**: The preview MUST show per household how many emails and how many texts will go out, per skipped household why, and totals per channel. It MUST say when text is chosen but sending is switched off.
- **FR-017**: A message type MUST NOT be sent by a channel for which it has no registered wording; the send MUST be refused whole, with a plain message naming the missing wording, and nothing goes out on either channel.
- **FR-018**: Text sending MUST be paced to the provider's limits for the couple's registration and MUST resume across runs until every text is sent or failed, never dropping a text for lack of capacity and never exceeding the limits. Texts that guests are waiting for (typed-number sign-in links) MUST NOT be stuck behind a bulk campaign.

**Text sending and delivery**

- **FR-019**: A single master switch MUST control all text sending, and MUST be off until the couple turn it on. With it off, nothing is texted (sign-in or campaign), phone numbers can still be stored and edited, and the console MUST show the state plainly.
- **FR-020**: Each text MUST be recorded per phone number: household, the number used at the time, message type, campaign, timestamp and delivery status (the existing statuses). Delivery notifications from the provider MUST update it, tolerating duplicates and out-of-order arrival, as for email. A notification MUST be accepted only if it can be verified as coming from the provider.
- **FR-021**: A failed text MUST flag that number and its household for follow-up, counted with existing delivery problems, and the flag MUST clear when the number is corrected or removed. A text refused because the recipient opted out (STOP) counts as a failed delivery. The site MUST NOT keep its own opt-out or consent list; the provider's standard STOP, START and HELP handling is relied on.
- **FR-022**: The console MUST show, per phone number, the latest delivery status in plain words, including why a text failed where the provider says.

**Wording**

- **FR-023**: This feature MUST write first drafts of the wording and plain templates for the sign-in text, the invitation text and the reminder text, registered in the repository and covered by tests, under the couple's existing permission to write first-draft wording for texts (recorded in `CLAUDE.md`). The couple polish them later. No visual design is involved.
- **FR-024**: The first-draft texts MUST say who they are from, include the link, and be as short as the content allows. They MUST NOT contain a guest's name or any other personal details beyond what an email of the same type already contains.

**Admin console v0**

- **FR-025**: The temporary admin console MUST let staff view and edit a household's phone numbers; show phone counts and paper-only state in the household list and detail; accept several phone columns in the import (with import help updated); choose the channel(s) of a campaign; show per-contact delivery in the preview, delivery status, overview and reports; and show and change the master switch. It MUST stay plain and use the existing single stylesheet.
- **FR-026**: The placeholder homepage's sign-in prompt MUST accept a phone number as described in FR-008. This is the only change to any guest-facing screen; the placeholder's other behavior and wording stay as they are, apart from the neutral answer's wording.

**Privacy, setup and documentation**

- **FR-027**: Phone numbers are personal data. They MUST NOT appear in logs, error messages shown to guests, or the change history (field names only), and fixtures and seed data MUST use numbers from the fictional range reserved for such use (555-0100 to 555-0199). Deleting a household MUST remove or irreversibly anonymise its phone numbers and text records.
- **FR-028**: The guest and admin interface documents, the manual setup document, the architecture document, the constitution's and `CLAUDE.md`'s statements about sign-in and scope, and the decision records MUST be updated in the same change: the neutral answer's new wording, the phone-number sign-in, the channel choice, and what the couple must set up by hand with the provider (account, number, registration, delivery notifications, and the master switch). The provider choice MUST be recorded as a decision.
- **FR-029**: The setup steps that cannot be done in code MUST be written for someone doing them for the first time, including that registration takes days to be approved and that texting stays off until it is, with secrets handled like the existing ones.

### Key Entities

- **Household contact (changed)**: gains the phone number as a second kind alongside email. One value belongs to one household, unique across households within its kind, with a delivery-problem flag.
- **Message (changed)**: one email or text to one contact in one campaign; records the channel and the contact used.
- **Campaign (changed)**: gains the choice of email, text or both.
- **Message type (changed)**: each type declares which channels it has wording for.
- **Texting setting (new)**: the master on/off switch, off by default.
- **Text wording**: the registered first-draft wording for the sign-in, invitation and reminder texts.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A guest who receives an invitation text reaches their household in one tap from the text, with no sign-up, password or code, in under 30 seconds, the same as by email.
- **SC-002**: For a household with several emails and several phone numbers, 100% of its contacts receive an invitation sent by "both" exactly once, and signing in from any of them reaches the same household and RSVP.
- **SC-003**: For known and unknown phone numbers, and for numbers outside the United States, the on-screen answer is identical in content and arrives within 250 milliseconds of one another on average; 0 accounts are created and 0 texts are sent to any number not on a household.
- **SC-004**: A household with only a phone number can complete every guest journey that an email-only household can, with no step requiring an email address: 100% of the guest journeys in the invite links spec's user stories, run once with an email-only household and once with a phone-only household, pass.
- **SC-005**: A campaign, including when retried, sends each contact exactly one message and no contact two, on both channels.
- **SC-006**: 100% of repeated, non-US or invalid phone numbers in an import of at least 200 rows are reported by row and column and none is saved; the same number typed in different formats is always treated as one number.
- **SC-007**: With texting off, 0 texts are sent by any route, and the console says so.
- **SC-008**: A campaign texted to 300 households completes with every text sent or recorded as failed, none dropped for rate reasons, and a sign-in text requested during the send arrives within 1 minute.
- **SC-009**: 100% of texts sent in production are rendered from wording registered in the repository.

## Assumptions

- **Provider: Twilio, to be confirmed by the couple** (the invite links spec had it as the leading option, not yet confirmed). Registration for individuals without a business tax number is as a "sole proprietor" brand: Twilio lists $4 to register the brand, $15 one-time campaign vetting, and $2 a month per campaign ([Twilio's sole proprietor registration page](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview-new%20experience) and [its fee FAQ](https://support.twilio.com/hc/en-us/articles/4407882914971-Comparision-between-Starter-and-Standard-registration-for-A2P-10DLC); one older Twilio article lists $4.50 for the brand fee, so confirm in the console before paying). This spec's requirements do not depend on the provider; the plan records the final choice as a decision.
- **Provider limits shape the design.** Twilio documents that a sole proprietor registration is limited to one campaign, one phone number per campaign and one message per second ([Twilio, "Message throughput and trust scores"](https://support.twilio.com/hc/en-us/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US)). Two third-party summaries (Zuper's and Salesmate's documentation) give a T-Mobile daily cap of about 1,000 messages for this tier; that figure is not yet confirmed by Twilio or T-Mobile directly, so the plan verifies it. If the guest list is larger than the daily cap, a campaign takes more than one day, which FR-018's resume-across-runs behavior covers. A larger registration is possible later but is not part of this feature.
- **STOP, START and HELP are handled by the provider.** Twilio's default opt-out words are STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT, matched case-insensitively; after one, further texts to that person from that number fail with a documented "unsubscribed recipient" error until they reply START ([Twilio on opt-out keywords](https://support.twilio.com/hc/en-us/articles/223134027-Twilio-Support-for-Opt-out-Keywords-SMS-STOP-Filtering), [error 21610](https://www.twilio.com/docs/api/errors/21610)). That failure is what the site records; it keeps no list of its own.
- **No consent tracking, by the couple's explicit decision (2026-10-29).** The couple vouch for their guests' consent, as they did for email. The system does not enforce quiet hours; the couple choose when to send.
- **United States only** by the couple's explicit decision. The plan decides how to recognise United States numbers reliably (including the +1 numbers that are not US) and how to verify it.
- **Same link, not a code**: Supabase's own phone sign-in is not used; the site texts a link exactly as it emails one, and the provider only delivers messages. The household's sign-in account is unchanged: it has no real email address or phone number, which live with the contacts.
- **Provider notifications** for delivery status arrive the way Resend's do today; the plan decides how they are verified.
- **Fictional numbers**: numbers 555-0100 to 555-0199 are reserved for fictional use ([Wikipedia's summary of the North American Numbering Plan's reservation](<https://en.wikipedia.org/wiki/555_(telephone_number)>)), so fixtures and seed data cannot reach a real person.
- **Scope.** Guest-facing screens other than the placeholder homepage's existing sign-in prompt stay out of scope; the guest interface changes are documented for the designer's frontend (FR-028). The rule against writing message content is lifted for first-draft texts only, by the couple's permission on 2026-10-29, which is already recorded in `CLAUDE.md`. Texts are plain text: no images, no pictures, no visual design.
- **Decisions this feature touches** (the plan records them): the household sign-in decision (`docs/decisions/0011-household-sign-in-and-invite-links.md`) says typed-address links come from the `magic_link` template by email and gains a phone path; the constitution says email delivery is by Resend and sign-in is "magic-link for everyone", which still holds (a text link is a magic link) but whose Email line needs a text-delivery companion.
- **Existing limits and rules are unchanged**: guests never create accounts themselves, sign-in never reveals who is on the guest list, the personal link closes on the wedding day, and the RSVP deadline never closes a link.
