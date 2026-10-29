# Feature Specification: Personal invite links, text messages and shared household sign-in

**Feature Branch**: `003-sms-sign-in-and-messaging` (work happens on the session branch; the spec directory name does not dictate it)

**Created**: 2026-10-26

**Status**: Draft, all open questions answered (rewritten 2026-10-29 with the couple's decisions; see Clarifications)

**Input**: User description (2026-10-26): "Add SMS (text message) as a way for guests to sign in and receive messages, alongside email. Households may have a phone number instead of or in addition to an email; guests who have a phone number can sign in with a one-time code sent by text, and the couple can send campaigns by text as well as email. Out of scope: email content, guest-facing screens. Consider consent and opt-out, carrier registration rules, delivery tracking, uniqueness of phone numbers across households, paper-only households, the admin console v0 screens that need a phone field, and the existing rule that sign-in never reveals who is on the guest list."

**Update (2026-10-29)**, in the couple's words: "For sign in I want to support two paths, email and sms. Same magic link for both, only one is required. For non-us users it'll be email only, for everyone else it'll be sms and email probably or just one or the other in some cases. This means also setting up proper email hooks like we discussed rather than supabase smtp." Then: "What I want is for us to import the guests and send emails and texts telling them to RSVP. When they click the link it counts as account creation and they're allowed to access the app from those devices." Then: "Let people stay signed on indefinitely once they're signed in. We'll want couples and families to get one account shared by multiple people too if that is possible to send this to multiple phones and emails." Then: "Links should stop working on day of wedding. But also need to be able to have an RSVP deadline that keeps the link alive but says that the deadline is passed. No Canadian numbers. I vouch for their consent. Staff sign in via email still. You can write the email and texts, I'll polish them later." And: "We will also need a way to allow the staff to manually mark people as rsvpd without having an email or phone number, like for elderly relatives."

## Clarifications

### Session 2026-10-29

- Q: How do guests first get in? → A: The couple import the guest list, then send each household an invitation by email and by text. The invitation carries a personal link for that household; opening it signs the guest in, with no separate sign-up. This is how wedding sites such as Joy work.
- Q: How long does a personal invite link work? → A: From when it is issued until the wedding day, unless the couple reissue it. It stops working on the wedding day. (Supabase's own sign-in links last an hour by default, so the personal link is the site's own and only uses Supabase behind the scenes.)
- Q: What happens after the RSVP deadline? → A: The personal link keeps working: guests can still sign in and see their answers, and are told the deadline has passed and to contact the couple to change anything. This is the existing deadline rule; staff can still change answers.
- Q: How do guests sign in by text: a typed code or a link? → A: A link, the same kind as by email. There is no typed-code flow.
- Q: How long do guests stay signed in? → A: Indefinitely on each device they have signed in on, until they sign out or the couple revoke access.
- Q: One account per person or per household? → A: One shared account per household. A household can have several email addresses and several phone numbers (for example both partners, or parents and an adult child), and every one of them gets the invitation and can sign in to the same household.
- Q: Must a household have both an email and a phone number? → A: No. Any one contact is enough.
- Q: Which countries can use texts? → A: United States numbers only. Canadian numbers, although they share the +1 country code, are not accepted. Everyone outside the United States uses email only.
- Q: How is consent for texts captured? → A: The couple vouch for it: when staff enter a phone number, they confirm the guest gave it for wedding messages, and that is recorded with who and when.
- Q: How do staff sign in? → A: By email link, as today. No text sign-in or personal links for staff.
- Q: Who writes the sign-in, invitation and reminder emails and texts? → A: This feature writes first drafts of the wording and plain templates; the couple polish the wording later. Making the emails look like the website follows the designer's design once it exists.
- Q: Can signed-in guests add, change or remove their own household's email addresses and phone numbers? → A: No, staff only. Guests can see their household's contacts but must ask the couple to change them.
- Q: After the wedding day, can guests still sign in by typing their email or phone number? → A: Yes. Only personal links stop on the wedding day; guests can still request a sign-in link, and anyone already signed in stays signed in.
- Q: Can staff record answers for guests with no email or phone? → A: Yes, as they can today: staff record RSVPs and meal choices on a household's behalf, marked as recorded by staff.
- Q: How are sign-in and invitation messages built and sent? → A: From templates registered in this repository and sent by this repository's code, so they look like the website and the invitations. Sign-in emails move to the Send Email hook (the auth-emails decision record, `docs/decisions/0004-auth-emails-via-resend.md`); the temporary custom SMTP setup in production is retired.

## Background

Today a household is reached by one contact email, or not at all (a "paper only" household that gets a printed invitation). One person per household, the responder, signs in by typing that email and receiving a one-time link that lasts about an hour. The couple send campaigns by email only. Production currently sends Supabase's own sign-in email through Resend over custom SMTP, as a stopgap.

This feature changes four things:

1. **Personal invite links.** Each household gets its own long-lived link. Invitations and reminders carry it, so opening the invitation is how a guest first signs in.
2. **Text messages.** A household can have United States phone numbers. Invitations, reminders and sign-in links can go by text as well as email.
3. **Shared household access.** A household can have several emails and phone numbers. All of them reach the same household and its one RSVP.
4. **Sign-in messages from the repository.** Sign-in emails and texts are built from templates kept in this repository, replacing Supabase's own wording and the custom SMTP stopgap.

Once signed in, a guest stays signed in on that device indefinitely.

Plain-language terms used below:

- **Household**: the unit that is invited and answers the RSVP together (unchanged).
- **Contact**: one email address or one phone number belonging to a household. A household has zero or more of each.
- **Personal invite link**: a long-lived web link unique to one household. Anyone opening it is signed in as that household.
- **Sign-in link**: a short-lived link a guest asks for by typing one of the household's contacts, for a new device or a lost invitation.
- **Campaign**: one send of a message type (an invitation, a reminder, an update) to a chosen group of households.
- **Paper only**: a household with no contacts at all.
- **Carrier registration**: in the United States, businesses that send application-to-person texts over ordinary phone numbers register the sender and the use case with the carriers first. Unregistered traffic can be blocked or fined. It is a setup step outside the code.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest signs in by opening their invitation (Priority: P1)

The couple import the guest list and send invitations. A guest opens the invitation email or text, taps their household's personal link, and is signed in to their household's RSVP straight away. They never create an account or choose a password. They stay signed in on that device.

**Why this priority**: it is how nearly every guest will first reach the site, and it matches how guests expect wedding sites to work.

**Independent Test**: import a household with one email and one phone number, send it an invitation campaign, open the link from the email on one device and from the text on another, and reach that household's RSVP on both, and nothing else.

**Acceptance Scenarios**:

1. **Given** an imported household that has been sent an invitation, **When** a guest opens the personal link, **Then** they are signed in as that household and can read and save its RSVP.
2. **Given** the same personal link, **When** it is opened weeks after the invitation was sent, **Then** it still signs the guest in.
3. **Given** a personal link the couple have cancelled, **When** anyone opens it, **Then** they land on a plain failure page with no household details, and can ask for a sign-in link instead.
4. **Given** a made-up or mistyped link, **When** anyone opens it, **Then** they land on the same failure page, and nothing reveals whether any household exists.
5. **Given** a guest signed in from a personal link, **When** they come back to the site on the same device weeks later, **Then** they are still signed in.
6. **Given** the RSVP deadline has passed, **When** a guest opens the personal link, **Then** they are signed in and can see their answers, are told the deadline has passed and to contact the couple, and cannot change answers.
7. **Given** it is the wedding day or later, **When** anyone opens a personal link, **Then** it no longer works and they land on the plain failure page.

---

### User Story 2 - Several people share one household's access (Priority: P1)

A household can list several email addresses and several phone numbers: both partners in a couple, or parents and an adult child. Every contact receives the invitation, and every one of them can sign in to the same household, see the same RSVP and change it.

**Why this priority**: couples and families answer together, and sending to only one member means the invitation is often missed.

**Independent Test**: give a household two emails and two phone numbers, send an invitation, and confirm four messages go out (one per contact), and that signing in from any of them reaches the same household and the same RSVP.

**Acceptance Scenarios**:

1. **Given** a household with several contacts, **When** an invitation campaign is sent, **Then** each contact receives exactly one message on its own channel, and all carry the same personal link.
2. **Given** two members signed in on different devices, **When** one saves a change to the RSVP, **Then** the other sees it on their next page load.
3. **Given** two members save the RSVP at about the same time, **When** both saves arrive, **Then** neither leaves the RSVP in a broken state, and the change history records each save.
4. **Given** the couple remove one contact from a household, **When** that person later types the removed address or number to ask for a sign-in link, **Then** nothing is sent and they get the neutral answer; other contacts are unaffected.

---

### User Story 3 - Guest asks for a sign-in link on a new device (Priority: P1)

A guest on a new phone or laptop, or who has lost the invitation, types any one of their household's email addresses or phone numbers on the sign-in page and receives a short-lived sign-in link by email or by text. Opening it signs them in, with the same access as the personal link.

**Why this priority**: personal links get lost or deleted, and people change devices; without this, a guest can be locked out.

**Independent Test**: with a household that has one email and one phone, ask for a link by each, open each, and reach the same household. Ask for a link for an unknown address and number and confirm the answer is identical.

**Acceptance Scenarios**:

1. **Given** a known contact, **When** a guest asks for a sign-in link for it, **Then** a link is sent to that contact only (by email for an address, by text for a number) and opening it signs them in to the household.
2. **Given** a sign-in link that has expired or been used, **When** it is opened, **Then** the guest lands on the plain failure page and can ask for another.
3. **Given** an email or number that is on no household, **When** someone asks for a link, **Then** they get exactly the same on-screen answer, taking the same time, as for a known contact, and nothing is sent and no account is created.
4. **Given** a known number that has replied STOP, or a number outside the United States, or texts not yet switched on, **When** someone asks for a link by text, **Then** they get the same neutral answer and no text is sent.

---

### User Story 4 - Couple manages households' contacts (Priority: P1)

The couple and the planner add, change and remove a household's email addresses and phone numbers, in the household form and in the guest-list spreadsheet import. They see at a glance how each household can be reached: email, text, both, or paper only, and how many contacts it has. They can also reissue a household's personal link, and sign a household out everywhere.

**Why this priority**: nothing else works until contacts are on file, and wrong data sends invitations to the wrong people.

**Independent Test**: create a household with two emails and a phone number, edit and remove one, import a spreadsheet with good, invalid and repeated contacts, and check per-row errors and the reachability shown. Reissue a household's link and confirm the old one stops working.

**Acceptance Scenarios**:

1. **Given** the household form, **When** staff enter a phone number in a common US format such as `(415) 555-0132`, **Then** it is saved in one standard form and shown back clearly.
2. **Given** a phone number outside the United States or not a valid number, **When** staff save, **Then** it is refused in plain words (a non-US guest should be given an email instead), and what was typed is kept.
3. **Given** an email or phone number already on another household, **When** staff save, **Then** it is refused with a plain message that it is already in use.
4. **Given** an import file with several email and phone columns per household, **When** it is imported, **Then** valid contacts are saved, and invalid or repeated ones are reported by row and column, with the rest of that household skipped as for other bad rows.
5. **Given** staff remove a household's last contact, **When** they save, **Then** they are warned it becomes paper only and nobody in it can sign in.
6. **Given** staff reissue a household's personal link, **When** the old link is opened, **Then** it no longer works, and the new link works; staff are reminded to send the new link.
7. **Given** staff choose "sign out everywhere" for a household, **When** any member next uses the site, **Then** they are signed out and must sign in again by a link.

---

### User Story 5 - Couple sends invitations and reminders by email and text (Priority: P2)

When creating a campaign, the couple choose the channels: email, text, or both. The audience filters work as today. The preview shows, per household, how many emails and texts will go out, and who is skipped and why. Invitation and reminder messages include the household's personal link.

**Why this priority**: it is how guests get their personal link, but it depends on contacts (Story 4), consent (Story 6) and text setup being in place.

**Independent Test**: with households that are email only, text only, both, several contacts, and paper only, send a campaign by both channels and confirm each contact got exactly one message, or is listed as skipped with a reason.

**Acceptance Scenarios**:

1. **Given** a campaign set to both channels, **When** it is sent, **Then** every reachable contact of every household in the audience receives exactly one message on its own channel.
2. **Given** the preview, **When** staff open it, **Then** each household shows what it will receive and each skipped contact shows why: no recorded consent, texts stopped by the guest, reminders opted out (for a non-essential type), or texts not switched on.
3. **Given** a campaign that has already been sent, **When** it is retried or run again, **Then** no contact receives a second copy.
4. **Given** a message type with no registered template for a channel, **When** staff try to send by that channel, **Then** the send is refused with a plain message and nothing goes out.
5. **Given** a household that opted out of reminders, **When** a reminder goes out, **Then** it is excluded on every channel, but an essential logistics update still goes to it, except to numbers that replied STOP.

---

### User Story 6 - Consent, STOP and HELP for texts (Priority: P2)

A guest can stop texts at any time by replying STOP (or a similar word) and ask for help by replying HELP. The system records consent for each phone number and every opt-out, and never sends a campaign text to a number without recorded consent or after a stop.

**Why this priority**: texting people who have not agreed, or who asked to stop, is the main legal and trust risk of this feature. It must exist before any campaign text is sent.

**Independent Test**: record consent for one number, send it a text, reply STOP, and confirm the next campaign skips that number with the reason shown while the household's other contacts still receive it; reply START and confirm texts resume.

**Acceptance Scenarios**:

1. **Given** a phone number with no recorded consent, **When** a text campaign is previewed or sent, **Then** that number is skipped and listed as "no recorded consent".
2. **Given** a guest replies STOP, QUIT, END, REVOKE, OPT OUT, CANCEL or UNSUBSCRIBE, **When** the reply arrives, **Then** that number is marked stopped, gets no further campaign texts, and staff can see it on the household; one confirmation text with no other content is allowed.
3. **Given** a stopped number, **When** the guest replies START, **Then** texts can resume, recorded with its time.
4. **Given** a guest replies HELP, **When** the reply arrives, **Then** they receive the standard help reply naming the sender and how to stop.
5. **Given** any text a guest receives, **When** they read it, **Then** it identifies the sender and says how to stop (the wording is supplied separately).

---

### User Story 7 - Sign-in messages come from the repository's own templates (Priority: P2)

Every sign-in email and text is built from a template registered in this repository and sent by this repository's code, so sign-in messages look like the website and the invitations and are versioned and tested with the code. Supabase's own email wording and the custom SMTP stopgap stop being used in production.

**Why this priority**: the couple require it, and it removes the dependence on Supabase's hourly email cap. It is P2 only because the stopgap already delivers sign-in emails while the templates are being made.

**Independent Test**: with fixture templates registered, ask for a sign-in link by email and by text, and confirm each is rendered from the registered template and that Supabase's own email is not sent.

**Acceptance Scenarios**:

1. **Given** a registered `magic_link` email template, **When** anyone asks for a sign-in link by email, **Then** it is rendered from that template and sent through Resend from the verified sending domain.
2. **Given** a registered sign-in text template, **When** a guest asks for a sign-in link by text, **Then** it is rendered from that template and sent through the text-messaging provider.
3. **Given** a missing or failing template, **When** a link is requested on that channel, **Then** nothing is sent, the guest still sees the neutral answer, and the failure is logged without any address or number.
4. **Given** the switch-over to the hook, **When** it happens, **Then** there is no period in which nobody can receive a sign-in email.

---

### User Story 8 - Couple tracks delivery and follows up (Priority: P3)

Each email and text sent is recorded per contact, with its delivery status updated from the sending services. A failed or undeliverable message flags that contact, and the household, for follow-up.

**Why this priority**: it makes sends accountable, but the feature is useful without polished tracking.

**Independent Test**: send a campaign to several contacts, deliver status notifications for each outcome (delivered, undeliverable, failed, repeated, out of order), and confirm the records, flags and counts.

**Acceptance Scenarios**:

1. **Given** a message that could not be delivered, **When** the status arrives, **Then** the contact and its household are flagged, and the couple see the failure, the channel and which contact.
2. **Given** the same status twice, or a later one before an earlier one, **When** they are processed, **Then** the record ends in the correct state.
3. **Given** a flagged contact, **When** it is corrected or removed, **Then** the flag clears.
4. **Given** the overview and report screens, **When** any contact of a household has a delivery problem, **Then** it counts under delivery problems with the channel visible.

---

### Edge Cases

- A personal link is forwarded to someone outside the household: whoever opens it is signed in as that household (as with Joy's personal links). The couple can reissue the link and sign the household out everywhere.
- A guest signs in on a shared or public computer: they stay signed in until they sign out, so a visible sign-out is part of the guest interface the frontend builds.
- A household's personal link is reissued after invitations went out: the old link stops working, and guests who already signed in stay signed in unless the couple also sign the household out everywhere.
- Two households in one home share a landline or an email: a contact can belong to only one household, so the couple list it once, or give the second household a different contact.
- A number typed in different formats is recognised as the same number for the repeat check.
- A landline or a number that cannot receive texts: the text fails, that contact is flagged, and the household's other contacts still work.
- A guest outside the United States: their phone number is refused at entry, and the household uses email. A non-US household with no email is paper only.
- Someone asks for many sign-in links (their own contacts, or ones they do not own): limits per contact and overall stop runaway cost and harassment, without revealing which contacts are known.
- A guest replies STOP to a sign-in text: that number gets no more campaign texts, and later sign-in texts may be blocked by the carrier; the guest can use another of the household's contacts.
- A staff member's email is also a household contact: not allowed; a person who is both staff and a guest uses different addresses for each (see FR-012).
- A household is deleted: all its contacts, consent records, personal link and message records are removed or anonymised under the same rule as today's contact email.
- Texts are switched off after being on: stored numbers and consent remain, nothing is sent, and previews say so. A scheduled campaign with text due while texts are off sends its emails, holds its texts, and tells the couple.
- An elderly relative with no email or phone (paper only) answers by post or by phone call: staff record the RSVP and meal choices on the household's behalf in the admin console, as they can today; it is marked as recorded by staff.
- The wedding day arrives: personal links stop working (see FR-005). Guests already signed in stay signed in.
- A guest asks for a sign-in link on or after the wedding day: short-lived sign-in links still work, so a guest can still reach the site (for example to see the schedule).

## Requirements _(mandatory)_

### Functional Requirements

**Household contacts**

- **FR-001**: A household MUST be able to have zero or more email addresses and zero or more phone numbers. No contacts means paper only; any one contact is enough to be reachable and to sign in.
- **FR-002**: Every email address and every phone number MUST belong to at most one household, compared case-insensitively for emails and in one standard form for numbers. A repeat MUST be refused with a plain message.
- **FR-003**: Phone numbers MUST be valid United States numbers (not Canadian; see FR-031); other numbers MUST be refused with a plain message that does not require knowing the standard form.
- **FR-004**: Only the couple and the planner MUST be able to add, change and remove a household's contacts; guests MUST NOT be able to change them, though a signed-in guest MAY see their own household's contacts. The guest-list import MUST accept several email and phone columns per household, with per-row, per-column errors, in both spreadsheet formats it already accepts. Removing the last contact MUST warn that the household becomes paper only. Removing a contact MUST stop it from being used to ask for a sign-in link immediately.

**Personal invite links and staying signed in**

- **FR-005**: Each household MUST have one personal invite link that signs in whoever opens it as that household. It MUST keep working from when it is issued until the wedding day, unless the couple reissue it, and MUST stop working from the start of the wedding day, in the venue's time zone (California). The wedding day is the date of the wedding event, so moving the event moves the cut-off.
- **FR-005a**: Passing the RSVP deadline MUST NOT stop a personal link. After the deadline, a signed-in guest MUST still be able to see their household's answers and MUST be told plainly that the deadline has passed and to contact the couple; changes stay refused as the existing deadline rule says, and staff can still change answers.
- **FR-006**: Personal links MUST be long, random and unguessable, MUST NOT contain any guest name, email or number, and MUST be stored so that a database leak does not reveal working links.
- **FR-007**: Staff MUST be able to reissue a household's personal link (the old one stops working at once) and sign a household out everywhere (every device must sign in again).
- **FR-008**: A guest who has signed in by any route MUST stay signed in on that device indefinitely, until they sign out, staff sign the household out everywhere, or the household is deleted. Guests MUST be able to sign out.
- **FR-009**: Opening a personal link MUST NOT create a new account: the household's sign-in account is created when it is imported or added, and opening the link signs into it. All of a household's contacts and links MUST lead to the same household account and the same access.
- **FR-008a**: Only personal links stop on the wedding day. Requesting a sign-in link by typing a contact (FR-011) MUST keep working after the wedding day, and existing sessions MUST NOT be ended by the wedding day.
- **FR-010**: A bad, cancelled or expired link MUST lead to one plain failure page that reveals nothing about any household.

**Sign-in links on request**

- **FR-011**: A guest MUST be able to ask for a short-lived sign-in link by typing any one of their household's contacts. The link MUST go only to the contact typed (an email by email, a number by text) and MUST sign in to the same household as the personal link.
- **FR-012**: Staff sign-in (couple and planner) MUST stay on email links; staff do not get personal invite links or sign-in by text. A staff email MUST NOT also be a household contact.
- **FR-013**: Asking for a sign-in link MUST never create an account and MUST never reveal whether a contact is on the guest list: the answer, status and response time MUST be the same for known, unknown, stopped and non-US contacts, and when texts are off.
- **FR-014**: The system MUST limit sign-in link requests per contact and overall, without changing the neutral answer. Limits MUST be settable without code changes.
- **FR-015**: The guest-facing interface for personal links, sign-in requests and sign-out MUST be documented in the repository alongside the existing guest interface. This feature builds no screens.

**Shared household access**

- **FR-016**: Any signed-in member of a household MUST be able to read and change the household's RSVP, with the rights the single responder has today. Concurrent changes MUST NOT corrupt the RSVP, and the change history MUST record each save (field names only, as today).

- **FR-016a**: Staff MUST keep the existing ability to record RSVPs and meal choices on a household's behalf, including for paper-only households with no contacts at all, with no email, phone number or sign-in involved. Answers recorded by staff MUST stay marked as recorded by staff, naming who, as today, and MUST be visible to any member who later signs in.

**Consent and opting out of texts**

- **FR-017**: The system MUST record consent per phone number: that it was given, how, who recorded it, and when. Campaign texts MUST NOT be sent to a number without recorded consent. A sign-in link the guest asked for is not a campaign and does not need prior consent. Consent is captured by the couple vouching for it: when staff add or import a phone number they MUST confirm the guest gave the number for wedding messages, and the system MUST record that confirmation with who gave it and when. A number added without that confirmation is stored but gets no campaign texts.
- **FR-018**: A reply of STOP or a listed equivalent (STOP, QUIT, END, REVOKE, OPT OUT, CANCEL, UNSUBSCRIBE, any capitalisation) MUST mark that number stopped within one minute, block further campaign texts to it, show that to staff, and record the time. Other contacts of the household are unaffected.
- **FR-019**: A reply of START MUST let a stopped number receive texts again, recorded with its time. A reply of HELP MUST produce the standard help reply naming the sender and how to stop.
- **FR-020**: The existing reminder opt-out MUST apply per household on every channel: non-essential types are excluded, essential logistics updates are still sent, except to stopped numbers.
- **FR-021**: Every campaign text MUST identify the sender and say how to stop. The wording is supplied separately.

**Campaigns**

- **FR-022**: A campaign MUST have a channel choice of email, text, or both, and MUST be sent to every reachable contact of each household in the audience. All existing audience filters MUST work unchanged; the preview MUST show per household what will be sent and per skipped contact why.
- **FR-023**: Invitation and reminder templates MUST be given the household's personal link to include. A send MUST remain idempotent per contact: re-running or retrying MUST NOT send any contact a second copy.
- **FR-024**: Each message MUST be recorded per contact: household, the contact used at the time, channel, message type, campaign, timestamp and delivery status (queued, sent, delivered, undeliverable, failed, plus email's existing bounced and complained). Delivery notifications MUST update it, tolerating duplicates and out-of-order arrival.
- **FR-025**: A failed or undeliverable message MUST flag that contact and its household for follow-up, counted with existing delivery problems with the channel shown, and the flag MUST clear when the contact is corrected or removed.
- **FR-026**: Texts MUST be controlled by one switch that is off until text sending is set up (provider account, carrier registration, sending number). While off, numbers and consent can be stored and previews work, but no text is sent; scheduled campaigns send their emails, hold their texts, and tell the couple.

**Sign-in messages from the repository**

- **FR-027**: Sign-in emails MUST be sent through the repository's Send Email hook using the `magic_link` template registered in the repository. Sign-in texts MUST be sent by repository code using a registered sign-in text template. If a template is missing or fails, nothing MUST be sent on that channel, the guest MUST still see the neutral answer, and the failure MUST be logged without any contact.
- **FR-027a**: This feature MUST write first drafts of the wording and plain templates for the sign-in email (`magic_link`), the sign-in text, and the invitation and reminder emails and texts, registered in the repository and covered by tests. The couple polish the wording later. Visual design that matches the website follows the designer's design when it exists; until then the templates are plain.
- **FR-028**: The custom SMTP stopgap MUST stay on until the hook is on and a test sign-in email through the hook has been delivered; then it MUST be removed and the manual setup document updated.

**Admin console v0**

- **FR-029**: The temporary admin console MUST let staff view and edit a household's contacts and each number's consent and stopped state; show reachability and contact counts in the household list and detail; reissue a household's personal link and copy it; sign a household out everywhere; accept several contact columns in the import; offer the channel choice in the campaign editor; and show per-contact channel, skips and delivery in the preview, delivery status, overview and reports. It MUST stay plain and use the existing single stylesheet.

**Privacy, setup and documentation**

- **FR-030**: Emails, phone numbers and personal links are personal data. They MUST NOT appear in logs, error messages shown to guests, or the change history (field names only), and fixtures and seed data MUST use fake contacts that cannot reach a real person. Deleting a household MUST remove or irreversibly anonymise its contacts, consent records, personal link and message records.
- **FR-031**: Text messaging MUST be limited to United States numbers. Canadian and other +1 numbers outside the United States MUST be refused like any other non-US number.
- **FR-032**: The setup steps that cannot be done in code (the text provider account, carrier registration, the sending number, reply and delivery notifications, the text switch, the Send Email hook switch-over and the removal of custom SMTP) MUST be added to the manual setup document, with secrets handled like the existing ones.

### Key Entities

- **Household (changed)**: keeps one sign-in account, now shared by all its members. Gains a personal invite link, a links-valid-until date, and a derived reachability state. Its single contact email moves into household contacts.
- **Household contact (new)**: one email address or one United States phone number belonging to one household, unique across all households, with a delivery-problem flag.
- **Phone consent**: for a phone contact, whether consent exists, how it was captured, who recorded it and when, and whether the number is currently stopped, with the time of each change.
- **Personal invite link (new)**: the household's long-lived sign-in link, stored so that a leak does not reveal it, with when it was issued and when it stops working.
- **Campaign (changed)**: gains a channel choice (email, text, both).
- **Message (changed)**: one email or text to one contact in one campaign; gains a channel and the contact used, and the text delivery statuses.
- **Message type (changed)**: gains, per channel, whether a template is registered.
- **Sign-in templates**: the registered `magic_link` email template and a registered sign-in text template.
- **Text messaging setting**: the single on/off switch, with who last changed it and when.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A guest who receives an invitation reaches their household's RSVP in one tap from the message, with no sign-up, password or code, in under 30 seconds.
- **SC-002**: A guest who signed in stays signed in on that device for at least the whole period from invitation to wedding without signing in again, unless they or staff sign them out.
- **SC-003**: For a household with several contacts, 100% of reachable contacts receive the invitation exactly once, and signing in from any of them reaches the same household and RSVP.
- **SC-004**: For known, unknown, stopped and non-US contacts, and with texts off, the sign-in request answer is identical in content and arrives within 250 milliseconds of one another on average; 0 accounts are created by any request or link.
- **SC-005**: After staff reissue a household's personal link, the old link signs in 0 people.
- **SC-006**: 100% of numbers that replied STOP receive 0 further campaign texts, and 100% of numbers without recorded consent receive 0 campaign texts, across a test of at least 200 households.
- **SC-007**: A campaign by both channels, including when retried, sends each reachable contact exactly one message and no contact two.
- **SC-008**: 100% of repeated or invalid contacts in an import of at least 200 rows are reported by row and column, and none is saved.
- **SC-009**: 100% of sign-in emails and texts in production are rendered from templates registered in the repository; 0 use Supabase's own wording.
- **SC-010**: Within 5 minutes of a status notification arriving, the contact's delivery status and any follow-up flag are correct, and duplicate or out-of-order notifications never leave a wrong state.

## Assumptions

- **This feature changes two earlier decisions**, which the plan must record as superseded: the guest-identity decision (`docs/decisions/0003-guest-identity.md`) keeps one sign-in account per household but drops the link to a single contact email, and adds personal links and sign-in by text; the household decision (`docs/decisions/0006-household-model.md`, exactly one responder per household) becomes any signed-in member answers for the household.
- Personal invite links are the site's own, not Supabase's: Supabase's sign-in links last an hour by default ([Supabase config reference](https://supabase.com/docs/reference/cli/config-reference)), and third-party write-ups say much longer values are discouraged. Opening a personal link signs into the household's Supabase account behind the scenes, using Supabase's documented admin function that generates a sign-in link without sending it ([generateLink](https://supabase.com/docs/reference/python/auth-admin-generatelink)). Exact mechanics are a planning question.
- Because sign-in by text uses a link, Supabase's own phone sign-in (which texts a typed code) is not needed; the text provider only delivers messages. To be confirmed at planning time.
- Staying signed in indefinitely is Supabase's default: sessions renew themselves and end only if a maximum lifetime or inactivity timeout is configured ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)). The plan confirms the production settings leave both off.
- Per-household personal links are how wedding sites such as Joy work; Joy notes that anyone with a guest's link can RSVP as that guest ([Joy help](https://withjoy.com/help/en/articles/8342084-personalized-ecard-links-for-guests)). The couple accept that risk, mitigated by reissue and sign-out everywhere.
- Texts are informational wedding messages (invitations, reminders, logistics updates), not marketing.
- In the United States, sending texts over ordinary numbers requires carrier registration first. A [sole-proprietor registration costs a few dollars and is limited to one campaign, one number and low throughput](https://support.twilio.com/hc/en-us/articles/4407882914971-Comparision-between-Starter-and-Standard-registration-for-A2P-10DLC), and approval involves human review with no published timeline, so it should start early. Fees and limits change; confirm with the chosen provider.
- Consent and opt-out rules follow current US law and carrier practice: listed reply words count as revocation, and [revocations must be honoured within 10 business days under the FCC's 2025 rule, with the "revoke all" part delayed](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/fcc-issues-one-year-limited-waiver-of-new-tcpa-consent-revocation-rule). This feature's target is one minute. This summary is from law-firm sources and is not legal advice; the couple should confirm it before the first campaign text.
- The project constitution says sign-in is "magic-link for everyone". Personal links and texted links are still magic links, so that line holds; the plan checks whether a wording clarification is worth making.
- The existing rules otherwise stay: guests never create accounts themselves, and sign-in never reveals who is on the guest list.
- Guest-facing screens stay out of scope; the guest-facing interface is documented here for the designer's frontend. Email and text content is in scope for this feature only as first drafts (FR-027a), by the couple's explicit permission on 2026-10-29, which overrides the repository's general rule against writing email content for these templates.
