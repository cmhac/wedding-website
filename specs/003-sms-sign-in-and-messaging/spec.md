# Feature Specification: Text messages (SMS) for guest sign-in and campaigns

**Feature Branch**: `003-sms-sign-in-and-messaging` (work happens on the session branch; the spec directory name does not dictate it)

**Created**: 2026-10-26

**Status**: Draft (resumed and updated 2026-10-29 with the couple's sign-in decisions; see Clarifications)

**Input**: User description: "Add SMS (text message) as a way for guests to sign in and receive messages, alongside email. Households may have a phone number instead of or in addition to an email; guests who have a phone number can sign in with a one-time code sent by text, and the couple can send campaigns by text as well as email. Out of scope: email content, guest-facing screens. Consider consent and opt-out, carrier registration rules, delivery tracking, uniqueness of phone numbers across households, paper-only households, the admin console v0 screens that need a phone field, and the existing rule that sign-in never reveals who is on the guest list."

**Update (2026-10-29)**: "For sign in I want to support two paths, email and sms. Same magic link for both, only one is required. For non-us users it'll be email only, for everyone else it'll be sms and email probably or just one or the other in some cases. This means also setting up proper email hooks like we discussed rather than supabase smtp."

## Clarifications

### Session 2026-10-29

- Q: How do guests sign in by text: a typed code or a link? → A: A link. The text carries the same kind of one-time sign-in link the email does, and it lands the guest in the same place with the same access. There is no separate typed-code flow.
- Q: Must a household have both an email and a phone number? → A: No. Either one is enough to sign in; a household may have one, the other, or both.
- Q: Which countries can use text sign-in? → A: United States numbers only. Guests outside the United States sign in by email only. (Whether Canadian numbers, which share the +1 country code, count as US is still open: see FR-028.)
- Q: How are sign-in emails delivered? → A: Through the repository's own Send Email hook and a template registered in the repository, so they look like the website and the invitations. The temporary custom SMTP setup in production is retired. Sign-in texts likewise go through code in this repository, with their wording registered in the repository.

## Background

Today a household can be reached in two ways: by email, or not at all (a "paper only" household that gets a printed invitation). Guests sign in with a one-time link sent to the household's contact email, and the couple send campaigns by email. This feature adds a second way to reach a household: a United States phone number that can receive text messages. The household's responder can ask for the same one-time sign-in link by text instead of email, and the couple can send campaigns by text.

It also finishes how sign-in messages are sent. Today production sends Supabase's own sign-in email through Resend over custom SMTP, a stopgap. This feature moves sign-in emails to the repository's Send Email hook and registered template (decided in the auth-emails decision record, `docs/decisions/0004-auth-emails-via-resend.md`), and sends sign-in texts the same way: from code and wording kept in this repository.

Plain-language terms used below:

- **Responder**: the one adult per household who signs in and answers for everyone (decided earlier: one responder per household).
- **Campaign**: one send of a message type to a chosen group of households.
- **Paper only**: a household with neither an email address nor a phone number. Before this feature it meant "no email".
- **Carrier registration**: in the United States, businesses that send application-to-person text messages over ordinary phone numbers register the sender and the use case with the carriers first. Unregistered traffic can be blocked or fined. It is a setup step outside the code.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest signs in with a link sent by text (Priority: P1)

A guest whose household has a phone number on file, and possibly no email, enters that number on the sign-in page and receives a one-time sign-in link by text. Opening the link signs them in to their household's RSVP: the same kind of link, landing and access as the email link gives. Guests choose the route by what they enter: an email address or a phone number.

**Why this priority**: it is the point of the feature. Some guests, especially older relatives, are far easier to reach by text than by email, and a phone-only household cannot sign in at all today.

**Independent Test**: with one household that has only a phone number, request a link for that number, open it, and reach that household's RSVP and nothing else.

**Acceptance Scenarios**:

1. **Given** a household with a phone number and no email, **When** the responder requests a link for that number and opens it, **Then** they are signed in as that household and can read and save its RSVP.
2. **Given** a household with both an email and a phone number, **When** the responder signs in by either route, **Then** both reach the same household with the same access.
3. **Given** a texted link that has expired or already been used, **When** the guest opens it, **Then** they land on the same failure page as for a bad email link and must request a new one.
4. **Given** a phone number that is on no household, **When** someone requests a link for it, **Then** they receive exactly the same on-screen answer, taking the same time, as for a known number, and no text is sent and no account is created.
5. **Given** a known number that has replied STOP, **When** its owner requests a link, **Then** the on-screen answer is still the neutral one, no text is delivered, and the guest can still sign in by email if the household has one.
6. **Given** text messaging has not been switched on yet, **When** anyone requests a link by text, **Then** they get the same neutral answer as above and nothing is sent.
7. **Given** a phone number outside the United States, **When** anyone requests a link for it, **Then** they get the same neutral answer and nothing is sent; that guest signs in by email.

---

### User Story 1a - Sign-in messages are sent from the repository's own templates (Priority: P1)

Every sign-in email and sign-in text is built from a template registered in this repository and sent by this repository's code, so sign-in messages look like the website and the invitations and are versioned and tested with the rest of the code. Supabase's own email wording and the temporary custom SMTP setup are no longer used in production.

**Why this priority**: the couple require sign-in messages to match the site and to live in the repository. It also removes the dependence on Supabase's hourly email cap.

**Independent Test**: with a fixture `magic_link` template registered, request a sign-in link by email and by text; confirm each message is rendered from the registered template, sent through the site's sending services, and that Supabase's own email is not sent.

**Acceptance Scenarios**:

1. **Given** a registered `magic_link` email template, **When** a guest or staff member requests a link by email, **Then** the email is rendered from that template and sent through Resend from the verified sending domain.
2. **Given** a registered sign-in text template, **When** a guest requests a link by text, **Then** the text is rendered from that template and sent through the text-messaging provider.
3. **Given** no registered template for a channel, **When** a link is requested on that channel, **Then** nothing is sent, the guest still sees the neutral answer, and the failure is logged without any address or number.
4. **Given** the hooks are on in production, **When** setup is reviewed, **Then** custom SMTP is switched off and recorded as removed in the manual setup document.

---

### User Story 2 - Couple records and manages phone numbers (Priority: P1)

The couple and the planner add, change and remove a household's phone number in the same places they manage the contact email: when creating or editing a household, and in the bulk import from a spreadsheet. They see at a glance which households can be reached by email, by text, by both, or only on paper.

**Why this priority**: nothing else works until numbers are on file, and bad data (typos, one number on two households) would send codes and campaigns to the wrong people.

**Independent Test**: create a household with a phone number, change it, clear it, and import a spreadsheet with good, invalid and repeated numbers; check the per-row errors and the reachability shown for each household.

**Acceptance Scenarios**:

1. **Given** the household form, **When** staff enter a phone number in a common US format such as `(415) 555-0132`, **Then** it is saved in one standard international form and shown back clearly.
   A number outside the United States is refused with a plain message that the household should use email.
2. **Given** a number that is not a valid phone number, **When** staff save, **Then** the form refuses it in plain words and keeps what was typed.
3. **Given** a number already on another household, **When** staff save, **Then** it is refused with a plain message, like a repeated contact email.
4. **Given** an import file with a phone column, **When** it is imported, **Then** valid numbers are saved, and invalid or repeated numbers are reported by row and column, with the rest of that household skipped as for other bad rows.
5. **Given** a household with a phone and no email, **When** staff view the list, **Then** it is shown as reachable by text, not as paper only.
6. **Given** staff clear the only phone number of a phone-only household, **When** they save, **Then** they are warned that the household will become paper only and can no longer sign in, and the change is recorded without storing the number.
7. **Given** a number is changed, **When** the old number is used to request a code, **Then** it no longer signs anyone in.

---

### User Story 3 - Couple sends a campaign by text (Priority: P2)

When creating a campaign, the couple choose how it goes out: by email, by text, or both. The audience filters work exactly as today. The preview shows who will get it, by which channel, and who is skipped and why. The couple then send now or schedule, and see delivery per household.

**Why this priority**: it delivers the second half of the request, but it depends on phone numbers (Story 2), consent (Story 4) and carrier setup being in place.

**Independent Test**: with households covering email-only, phone-only, both and neither, build a campaign for text, check the preview, send it, and confirm each household got exactly one text, or is listed as skipped with a reason.

**Acceptance Scenarios**:

1. **Given** a campaign set to send by text, **When** staff open the audience preview, **Then** each household shows "will get a text" or the reason it is skipped: no phone number, no recorded consent, texts stopped by the guest, reminders opted out (for a non-essential type), or text messaging not enabled.
2. **Given** a campaign set to send by both email and text, **When** it is sent, **Then** a household with both receives each once, and a household with only one receives that one.
3. **Given** a campaign that has already been sent, **When** it is run again or retried, **Then** no household receives a second copy by either channel.
4. **Given** a message type with no text content registered, **When** staff try to send it by text, **Then** the send is refused with a plain message and nothing goes out.
5. **Given** a household that opted out of reminders, **When** a reminder goes out by text, **Then** it is excluded, but an essential logistics update still goes to it, unless the guest has replied STOP.

---

### User Story 4 - Consent, STOP and HELP are recorded and honored (Priority: P2)

A guest can stop texts at any time by replying STOP (or a similar word), and ask for help by replying HELP. The system records the consent behind each phone number and every opt-out, and never sends a campaign text to a number without recorded consent or after a stop.

**Why this priority**: sending texts to people who have not agreed, or who asked to stop, is the main legal and trust risk of this feature. It must exist before any campaign text is sent.

**Independent Test**: record consent for one number, send it a text, reply STOP, and confirm the next campaign skips that household with the reason shown; reply START and confirm texts resume.

**Acceptance Scenarios**:

1. **Given** a phone number with no recorded consent, **When** a campaign by text is previewed or sent, **Then** that household is skipped and listed as "no recorded consent".
2. **Given** a guest replies STOP, QUIT, END, REVOKE, OPT OUT, CANCEL or UNSUBSCRIBE to any text, **When** the reply arrives, **Then** the number is marked stopped, no further campaign texts go to it, staff can see that on the household, and one confirmation text without any other content is allowed.
3. **Given** a stopped number, **When** the guest replies START (or the carrier's equivalent), **Then** texts can resume, and the change is recorded with its time.
4. **Given** a guest replies HELP, **When** the reply arrives, **Then** they receive the standard help reply that names the sender and how to stop.
5. **Given** any text a guest receives, **When** they read it, **Then** it identifies the sender and says how to stop (the wording is supplied separately, as for email).

---

### User Story 5 - Couple tracks text delivery and follows up (Priority: P3)

Each text sent is recorded as its own record, with its delivery status updated from the sending service's notifications. Failed or undeliverable texts flag the household for follow-up, and the existing overview, delivery-status and report screens count them alongside email problems.

**Why this priority**: it makes text sends accountable, but the feature is useful without polished tracking.

**Independent Test**: send a campaign by text to several households, deliver status notifications for each outcome (delivered, undeliverable, failed, repeated, out of order), and confirm the records, flags and counts.

**Acceptance Scenarios**:

1. **Given** a text that could not be delivered, **When** the status arrives, **Then** the household is flagged for follow-up and the couple see the failure and its channel.
2. **Given** the same status notification arrives twice, or a later one arrives before an earlier one, **When** they are processed, **Then** the record ends in the correct state.
3. **Given** a household flagged for a failed text, **When** its phone number is corrected and saved, **Then** the flag clears so the next send can try again, as it does for email.
4. **Given** the overview and report screens, **When** a household has failed email or text delivery, **Then** it counts under delivery problems, with the channel visible.

---

### Edge Cases

- A landline, a number that cannot receive texts, or a number that has changed owner: the text fails, the household is flagged, and email (if any) still works.
- Two households in one home share a phone: the second is refused as a repeat, so the couple either list the shared phone once or leave the second household with an email only.
- A number typed in different formats (with or without a country code, spaces, dashes) is recognised as the same number for the repeat check.
- A guest outside the United States: their number is refused at entry with a plain message, and the household uses email. A non-US household with no email is paper only.
- A person requests many links (their own number, or numbers they do not own): limits per number and overall stop runaway cost and harassment without revealing which numbers are known.
- A guest replies STOP to a sign-in text: the number is stopped for campaigns too, and later sign-in texts may not be delivered by the carrier; they can use email if the household has it, otherwise staff must be told so they can sort it out another way.
- A link arrives late, after a newer one was requested: the same rule as email links applies to which links still work.
- The guest opens the texted link on a different device from where they asked for it: it works the same as the email link does today.
- A staff account (couple or planner) shares a phone number with a household: staff sign-in stays on email, so there is no clash.
- A household is deleted: its phone number, consent and message records are removed or anonymised under the same rule as its email.
- Text messaging is switched off after being on: stored numbers and consent remain, nothing is sent, and previews say so.
- A scheduled text campaign comes due while text messaging is off: it is held and the couple are told, not silently dropped.

## Requirements _(mandatory)_

### Functional Requirements

**Phone numbers on households**

- **FR-001**: The system MUST store, per household, zero or one contact phone number: the responder's number. It is kept in one standard international form, whatever format was typed.
- **FR-002**: A household MUST be allowed to have an email, a phone number, both, or neither. Neither means "paper only"; a household with only a phone number is reachable by text and is not paper only.
- **FR-003**: Phone numbers MUST be unique across households, compared in the standard form, so different ways of typing one number count as the same number. A repeat MUST be refused with a plain message, as a repeated contact email is.
- **FR-004**: The system MUST refuse a number that is not a valid United States number (see FR-028 on Canada), with a plain message that does not require the user to know the standard form.
- **FR-005**: The couple and the planner MUST be able to add, change and clear a household's phone number, and the guest-list bulk import MUST accept a phone column with per-row, per-column errors for invalid and repeated numbers, in both spreadsheet formats the import already accepts.
- **FR-006**: Clearing the only phone number of a household that has no email MUST warn that the household will become paper only and unable to sign in. Changing or clearing a number MUST take effect for sign-in immediately.

**Signing in by text**

- **FR-007**: A guest MUST be able to request a one-time sign-in link for a phone number, delivered by text, and sign in by opening it, reaching exactly the household the number belongs to, with the same access and restrictions as signing in by email. The household's session MUST be the same whichever route was used.
- **FR-008**: A texted link MUST follow the same rules as an emailed link: short-lived, single-use, the same landing page, and the same failure page. A household with both an email and a phone number MUST be able to use either; only one is required.
- **FR-009**: Requesting a link by text MUST never create an account and MUST never reveal whether a number is on the guest list: the on-screen answer, status and response time MUST be the same for known numbers, unknown numbers, stopped numbers and when text messaging is off. A text MUST be sent only to a known number that is not stopped and only when text messaging is on.
- **FR-010**: The system MUST limit link requests by text per number and overall, so one person cannot trigger a flood of texts, without changing the neutral answer. Limits MUST be settable without code changes.
- **FR-011**: Staff sign-in (couple and planner) MUST stay on email; this feature does not add text sign-in for staff. [Assumed; to confirm with the couple.]
- **FR-012**: The guest-facing interface for sign-in by text MUST be documented in the repository alongside the existing guest interface, so any frontend can use it. This feature builds no screens.

**Consent and opting out**

- **FR-013**: The system MUST record consent per phone number: that it was given, how it was captured, who recorded it, and when. Campaign texts MUST NOT be sent to a number without recorded consent. A one-time sign-in link requested by the guest themselves is not a campaign and does not need prior consent.
- **FR-014**: When a guest replies STOP or any listed equivalent (STOP, QUIT, END, REVOKE, OPT OUT, CANCEL, UNSUBSCRIBE, in any capitalisation), the system MUST mark the number stopped, send no further campaign texts to it, show that to staff, and record the time. This MUST take effect within one minute of the reply arriving, and in all cases within the legal limit.
- **FR-015**: A reply of START (or the carrier-standard equivalent) MUST let a stopped number receive texts again, recorded with its time. A reply of HELP MUST produce the standard help reply naming the sender and how to stop.
- **FR-016**: The existing reminder opt-out MUST apply to text as it does to email: non-essential types are excluded for households that opted out, essential logistics updates are still sent unless the number is stopped.
- **FR-017**: Every campaign text MUST identify the sender and say how to stop. The wording is supplied separately; the system MUST refuse to send a text for a message type that has no registered text content.

**Campaigns by text**

- **FR-018**: A campaign MUST have a channel choice of email, text, or both. All existing audience filters MUST work unchanged for every channel, and the audience preview MUST show, per household, the channel it will use or the reason it is skipped.
- **FR-019**: A send MUST remain idempotent per channel: re-running or retrying a campaign MUST NOT send a household a second copy by the same channel.
- **FR-020**: Each text MUST be recorded as its own record: household, number used at the time, message type, campaign, timestamp, channel and delivery status (queued, sent, delivered, undeliverable, failed). Delivery notifications MUST update it, tolerating duplicates and out-of-order arrival.
- **FR-021**: A household whose text fails or is undeliverable MUST be flagged for follow-up and counted with email delivery problems, with the channel shown, and the flag MUST clear when its phone number is corrected.
- **FR-022**: Text messaging MUST be controlled by one switch that is off until sending has been set up (provider account, registered sender, supported-country rules). While off, numbers and consent can be stored and previews work, but no text is sent and no sign-in text is sent; scheduled text sends wait and the couple are told.

**Admin console v0**

- **FR-023**: The temporary admin console MUST let staff view and edit a household's phone number and its consent and stopped state, show reachability (email, text, both, paper only) in the household list and detail, accept a phone column in the import and its result, offer the channel choice in the campaign editor, show channel and skip reasons in the audience preview, and show channel in delivery status, the overview's follow-up counts and the reports. It MUST stay plain and use the existing single stylesheet.
- **FR-024**: Records of who changed what MUST include phone changes by field name only; phone numbers MUST NOT be stored in the change log.

**Sign-in messages from the repository**

- **FR-030**: Sign-in emails MUST be sent through the repository's Send Email hook using the `magic_link` template registered in the repository, as the auth-emails decision record describes. Once the hook is on in production, Supabase's custom SMTP setting MUST be removed and the manual setup document updated.
- **FR-031**: Sign-in texts MUST be sent by code in this repository using a sign-in text template registered in the repository, through the chosen text-messaging provider. The wording is supplied separately, as for email; this feature writes none.
- **FR-032**: If the template for a channel is missing or fails, no sign-in message MUST be sent on that channel, the guest MUST still see the neutral answer, and the failure MUST be logged without any address or number.
- **FR-033**: The hook switch-over MUST NOT leave a gap in which guests or staff cannot sign in: custom SMTP stays on until the hook is on and a test sign-in by email has been delivered.

**Privacy, setup and documentation**

- **FR-025**: Phone numbers are personal data. They MUST NOT appear in logs, error messages shown to guests, or history records, and fixtures and seed data MUST use fake numbers that cannot reach a real person.
- **FR-026**: Deleting a household MUST remove or irreversibly anonymise its phone number, consent record and message records under the same rule as its email.
- **FR-027**: The setup steps that cannot be done in code (the sending provider account, the sender registration, the sending number, the reply and delivery notifications, and the on-switch) MUST be added to the manual setup document, with secrets handled like the existing email secrets.
- **FR-028**: Text sign-in and texts MUST be limited to United States numbers; every other guest uses email. [NEEDS CLARIFICATION: do Canadian numbers, which share the +1 country code, count as allowed or as email only?]
- **FR-029**: How consent is captured MUST be [NEEDS CLARIFICATION: how is consent for campaign texts obtained? Options are the couple attesting at entry that the guest gave the number for wedding messages, the guest confirming by replying to a first text, or the guest agreeing when they first sign in by text].

### Key Entities

- **Household (changed)**: gains an optional contact phone number (standard international form, unique across households) alongside the contact email, and a reachability state derived from email, phone and consent.
- **Phone consent**: for a household's number, whether consent exists, how it was captured, who recorded it and when, and whether the number is currently stopped, with the time of each change.
- **Text sign-in link**: the same kind of short-lived, single-use sign-in link as by email, delivered to one number.
- **Campaign (changed)**: gains a channel choice (email, text, both).
- **Message (changed)**: one email or one text to one household in one campaign; gains a channel, and the text delivery statuses (undeliverable in addition to the existing ones).
- **Sign-in templates**: the registered `magic_link` email template and a registered sign-in text template.
- **Message type (changed)**: gains, per channel, whether content is registered, so text can be refused when no text content exists.
- **Text messaging setting**: the single on/off switch, with who last changed it and when.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A guest in a phone-only household signs in with a texted link in under 60 seconds from asking for it, with no email involved.
- **SC-002**: For known, unknown and stopped numbers, and with text messaging off, the sign-in answer is identical in content and arrives within 250 milliseconds of one another on average, so the guest list cannot be learned from it; 0 accounts are created by any sign-in request.
- **SC-003**: 100% of numbers that have replied STOP receive 0 further campaign texts, and 100% of numbers without recorded consent receive 0 campaign texts, across a test of at least 200 households.
- **SC-004**: A campaign by both channels reaches 100% of reachable households exactly once per channel, including when retried, and 0 households twice.
- **SC-005**: 100% of repeated or invalid phone numbers in an import of at least 200 rows are reported by row and column, and none is saved.
- **SC-006**: Staff can add a phone number to a household, record its consent, and see the household's reachability in under 2 minutes without help.
- **SC-007**: Within 5 minutes of a status notification arriving, the household's text status and any follow-up flag are correct, and duplicate or out-of-order notifications never leave a record in a wrong state.
- **SC-009**: 100% of sign-in emails and texts in production are rendered from templates registered in the repository; 0 are sent with Supabase's own wording.
- **SC-008**: Every household appears in exactly one of these reachability states in the console: email, text, both, or paper only, and the count of paper-only households never includes a household with a phone number.

## Assumptions

- Only the responder's number is stored, as one contact phone per household. Personal phone numbers for other guests are out of scope.
- Staff sign-in stays on email. The couple and the planner do not sign in by text.
- Guests choose how to sign in by what they enter: an email address or a phone number. A household with both can use either; only one is required.
- The same message types, opt-out rules and "essential versus non-essential" split apply to text as to email. Text wording for each type is supplied separately, as email content is; this feature writes none.
- Texts are informational wedding messages (invitations, reminders, logistics updates), not marketing. Sign-in codes are sent only because the guest asked for one.
- Supabase's phone sign-in is built around a typed code, not a link. Sending a link by text is therefore a planning question (for example, a Send SMS hook that puts the sign-in link in the text). It is to be confirmed against Supabase's documentation at planning time.
- Sending is through a commercial text-messaging provider that Supabase Auth supports for phone sign-in. Supabase's phone sign-in supports [several providers, including Twilio, MessageBird, Vonage and TextLocal](https://supabase.com/docs/guides/auth/phone-login). Choosing one is a planning decision and will be recorded as a decision record.
- In the United States, sending texts over ordinary numbers requires carrier registration first. A [sole-proprietor registration costs a few dollars to register and a couple of dollars a month, and is limited to one campaign, one number and low throughput](https://support.twilio.com/hc/en-us/articles/4407882914971-Comparision-between-Starter-and-Standard-registration-for-A2P-10DLC), but approval time is not published and involves human review, so it should be started early. Fees and limits change, so they are to be confirmed with the chosen provider at planning time.
- Consent and opt-out rules follow current US law and carrier practice: consent can be withdrawn by any reasonable means, listed reply words count as revocation, and [revocations must be honoured within 10 business days under the FCC's 2025 rule, with the "revoke all" part delayed](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/fcc-issues-one-year-limited-waiver-of-new-tcpa-consent-revocation-rule). This feature's target is far stricter, one minute. This summary is from law-firm sources, not the FCC's order, and is not legal advice, so the couple should confirm it before the first campaign text.
- Supabase's default limits on code requests (about one per minute per user and one-hour expiry, per its [phone login guide](https://supabase.com/docs/guides/auth/phone-login)) are a starting point. The plan sets stricter limits for this site and adds bot protection, because text messages cost money per send.
- The project constitution says sign-in is "magic-link for everyone". Text sign-in sends the same magic link, so that line still holds; the plan checks whether a wording clarification is still worth making.
- The existing rules stay as they are: guests never create accounts, a household has exactly one responder, contact emails are unique, and sign-in never reveals who is on the guest list.
- Guest-facing screens, email content and text content stay out of scope; the sign-in templates are supplied by others. The guest-facing interface is documented here for the designer's frontend.
