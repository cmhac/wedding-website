# Feature Specification: Text messages as a first-class way to sign in and be messaged

**Feature Branch**: `005-sms-support` (work happens on the session branch; the spec directory name does not dictate it)

**Created**: 2026-11-10

**Status**: Draft (revised 2026-11-11: guests opt in to texts themselves; no verbal consent)

**Input**: User description (2026-11-10): "We previously deferred sms setup. I want to go ahead and get started on that now ... build a new spec for full sms support. sms should be a first class login method, equal to email."

**Update (2026-11-11)**, in the couple's words: "instead of the verbal consent thing, we're going to actually only send an initial email for the sign up, and when users sign in for the first time we will do a normal consent checkbox."

**Update (2026-11-11, later)**, in the couple's words: "if twilio is not configured, the app has all sms features disabled and sms related UI content will not be displayed. a banner in the admin UI should warn admins that sms is not configured. all signin and invite sending stuff should still work via email."

This feature picks up the "Deferred: text messages" section of the personal invite links spec ([`specs/003-personal-invite-links/spec.md`](../003-personal-invite-links/spec.md)), whose decisions carry over unchanged unless this spec says otherwise. It also builds on the placeholder homepage spec ([`specs/004-placeholder-homepage/spec.md`](../004-placeholder-homepage/spec.md)), whose sign-in prompt is the guest's front door.

## Clarifications

### Session 2026-11-10

- Q: What does "equal to email" mean? → A: Once a guest has opted in, anything a guest or the couple can do through an email address, they can do through a phone number, with the same rules, the same neutral answers and the same limits. Staff are the one exception: they keep signing in by email (carried over from the invite links spec). The one difference is the first contact, which is always by email, never by text (see the 2026-11-11 answers).
- Q: Which earlier decisions carry over? → A: From "Deferred: text messages" in the invite links spec: United States numbers only; the same link as email rather than a typed code; campaigns by email, text or both; the provider's standard STOP, START and HELP handling; one on/off switch for texts, off until the provider is set up; sign-in texts from templates kept in the repository, with first-draft wording written here. One decision does not carry over: "no consent tracking" is replaced (see 2026-11-11).
- Q: Is a one-time code (typed in from the text) offered as well? → A: No. A text carries a link, exactly as an email does.
- Q: Which provider? → A: Twilio, confirmed by the couple on 2026-11-10. Other providers and routes were checked the same day; none avoids the carriers' identity checks, which apply whichever provider sends the texts.
- Q: Does this feature build the privacy policy and terms pages that Twilio's registration requires? → A: Yes. The couple granted a narrow exception on 2026-11-10 to the rule against building guest-facing screens: two plain, public, static text pages, a privacy policy and terms (see User Story 7).

### Session 2026-11-11

- Q: How do guests agree to be texted? → A: Only by ticking an unticked checkbox on the site. There is no verbal or offline consent. A guest ticks it either the first time they sign in (a one-time step that lists the household's numbers) or on the sign-in prompt when they type a number. This replaces the earlier "I vouch for their consent" decision: the site now records each number's opt-in.
- Q: How does a guest first hear about the site? → A: The save the date and the invitation can each be sent by email, text or both. A number is texted only once its opt-in has been recorded, so no text of any kind is sent to a number that has not opted in.
- Q: What about a household with only a phone number and no email? → A: Its numbers are texted once they have opted in. Until then the preview shows them as skipped, "not opted in", and the couple reach the household another way (a paper invitation carrying the site address, or a personal message with the household's personal link, which the console already lets staff copy). The guest then opens the link or types their number, ticks the checkbox, and from then on is texted like anyone else.
- Q: What if a guest says no to texts? → A: Their answer is recorded and they are not asked again for that number. They can still opt in later by typing the number into the sign-in prompt and ticking the checkbox, and they lose nothing: email always works.
- Q: Is a confirmation text sent after a guest opts in? → A: Yes, one text per number, straight away, saying they are signed up and carrying the required disclosures (how often, message and data rates, STOP and HELP).

- Q: What happens when the text-message provider is not configured? → A: All text features are off and invisible: no text is sent, nobody can opt in, and no text-related content appears anywhere guests or staff look, apart from one warning banner in the admin console and the two public legal pages (see User Story 8). Sign-in and every email, including invitations, work exactly as they did before this feature.
- Q: Is "configured" the same as the on/off switch? → A: No. "Configured" means the server has the provider settings it needs, which is a fact about the deployment. The on/off switch is the couple's choice to go live once the carriers approve the registration. Texting is available only when the provider is configured and the switch is on; either one off means off.
- Q: Do the public privacy and terms pages hide their text-message wording when texting is not configured? → A: No. They are static legal text that the carrier registration requires reviewers to be able to read before texting is ever switched on, so they always show it.

## Background

Today a household is reached by zero or more email addresses. A guest signs in by opening the personal link in an invitation email, or by typing one of the household's email addresses to be sent a short-lived link. Campaigns go out as one email per address. The data was designed so that a phone number could later be added as a second kind of contact without reworking it, and that is what this feature does.

Texting differs from email in one way that shapes this feature: nobody is ever texted until they have ticked a checkbox saying they want to be. The couple import the guest list, including any phone numbers, and send the save the date and the invitation by email, text or both. When a guest first signs in, they are asked whether they would like text updates at the numbers on file. Only then do texts flow.

Plain-language terms used below:

- **Household**, **personal invite link**, **sign-in link**, **campaign**, **paper only**: as in the invite links spec. Paper only now means a household with no email address and no phone number.
- **Contact**: one way to reach a household: an email address or a phone number.
- **Text**: an SMS text message sent to a phone number.
- **Channel**: email or text.
- **Opted in**: a phone number whose opt-in has been recorded because a guest ticked the consent checkbox for it.
- **Consent step**: the one-time screen shown after a guest's first sign-in, listing the household's numbers with an unticked checkbox for each.
- **Texting configured**: the server has the text-message provider's settings it needs. A fact about the deployment, not a choice.
- **Texting available**: texting is configured and the couple's on/off switch is on. Everything text-related happens only when texting is available.
- **Opted out of texts (STOP)**: a recipient who replied STOP, or an equivalent word, to the couple's texting number. The provider then refuses further texts to that person from that number until they reply START.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest opts in to texts when they first sign in (Priority: P1)

A guest opens their invitation email, taps the personal link and is signed in. If texting is on and their household has phone numbers they have not yet answered for, the site shows the consent step: each number (masked) with an unticked box, a plain statement of what the texts are and how often, and one button to save their choice. Ticking a box opts that number in and sends it a confirmation text; leaving it unticked records "no thanks".

**Why this priority**: it is the only way a number becomes textable, so every other text story depends on it.

**Independent Test**: import a household with one email and one phone number, send the invitation by email and by text to a household with a recorded opt-in, open its link, tick the box for the number, and confirm a confirmation text is sent and the number is recorded as opted in. Repeat leaving it unticked and confirm nothing is sent and the step does not return.

**Acceptance Scenarios**:

1. **Given** texting is on and a household has a number with no answer yet, **When** a guest signs in for the first time by any route, **Then** the consent step is shown before anything else, with an unticked checkbox for each such number, the consent statement (FR-009), and links to the privacy and terms pages.
2. **Given** the consent step, **When** the guest ticks a number's box and saves, **Then** that number is recorded as opted in (when and where), and a single confirmation text is sent to it.
3. **Given** the consent step, **When** the guest leaves a box unticked and saves, **Then** that number is recorded as declined, no text is sent to it, and the step does not appear again for it.
4. **Given** the guest has answered every number, **When** they sign in again on any device, **Then** the consent step does not appear.
5. **Given** staff later add a new number to the household, **When** a guest next opens the site, **Then** the consent step appears for that number only.
6. **Given** texting is switched off, **When** a guest signs in, **Then** no consent step is shown (the site does not promise texts it cannot send).
7. **Given** a number that has opted in, **When** a text carrying the personal link arrives and is opened, **Then** it signs in exactly as an emailed link does: not used up, on any device, the same failure page for a reissued, made-up or wedding-day link, and the same RSVP-deadline behavior.

---

### User Story 2 - Guest asks for a sign-in link by typing their phone number (Priority: P1)

A guest on a new device, or who has lost the invitation, types their phone number into the same sign-in prompt where they would type an email address. For a phone number the prompt also shows the consent statement with an unticked checkbox, and nothing is sent until it is ticked. A known number then receives a short-lived sign-in link by text, and its opt-in is recorded.

**Why this priority**: it is the phone-number half of "equal to email", and it is the way a phone-only household first gets in.

**Independent Test**: with a household that has one email address and one phone number, ask for a link by each and open each; both reach the same household. Ask for a link for an unknown number and confirm the answer is identical.

**Acceptance Scenarios**:

1. **Given** a phone number on a household, **When** a guest types it in any common way (with or without spaces, dashes, brackets, the leading 1 or +1), ticks the checkbox and asks for a link, **Then** a link is texted to that number only, its opt-in is recorded, and opening the link signs them in to the household.
2. **Given** the prompt with a phone number typed, **When** the checkbox is unticked, **Then** the button cannot send a text link, and the guest is told they can tick the box or use their email address.
3. **Given** a link that has expired or been used, **When** it is opened, **Then** the guest lands on the plain failure page and can ask for another.
4. **Given** a number that is on no household, a number outside the United States, or texting not available, **When** someone asks for a link (checkbox ticked), **Then** they get exactly the same on-screen answer, taking the same time, as for a known number, and nothing is sent, nothing is recorded and no account is created.
5. **Given** one sign-in prompt, **When** a visitor types an email address or a phone number, **Then** the prompt works out which it is, with no channel picker, and either way the on-screen answer is the same wording. Email needs no checkbox.
6. **Given** a household member who is texting-blocked at the provider because they replied STOP, **When** they ask for a link by text, **Then** the on-screen answer is still the neutral one, and the guest can instead use their email address, their personal link, or reply START (the guest interface documentation says so).
7. **Given** a number that declined at the consent step, **When** its owner types it into the prompt and ticks the checkbox, **Then** the number is recorded as opted in and the link is texted.

---

### User Story 3 - Couple manages households' phone numbers (Priority: P1)

The couple and the planner add, change and remove a household's phone numbers, in the household form and in the guest-list spreadsheet import, alongside email addresses. A household can have any number of each; any one contact is enough. They can see which numbers have opted in.

**Why this priority**: nothing else works until numbers are on file, and a wrong number would receive a stranger's opt-in.

**Independent Test**: create a household with one email and two phone numbers, edit and remove one number, then import a spreadsheet with good, invalid, non-US, repeated and differently formatted numbers and check the per-row, per-column errors and the counts shown.

**Acceptance Scenarios**:

1. **Given** a phone number already on another household, **When** staff save, **Then** it is refused with a plain message that it is already in use, even if the two were typed in different formats.
2. **Given** a number that is not a valid United States number (including Canadian and other +1 numbers outside the United States, or one that is too short or too long), **When** staff save or import it, **Then** it is refused with a plain message that only United States numbers are supported and the household can use email instead.
3. **Given** an import file with several phone columns per household, **When** it is imported, **Then** valid numbers are saved in one standard form, none is texted, and invalid or repeated ones are reported by row and column, with the rest of that household skipped as for other bad rows.
4. **Given** staff remove a household's last contact of either kind, **When** they save, **Then** they are warned it becomes paper only and nobody in it can sign in.
5. **Given** staff remove a phone number, **When** its owner later asks for a sign-in link by that number, **Then** nothing is sent and they get the neutral answer; the household's other contacts are unaffected. Its opt-in record goes with it.
6. **Given** the household list and detail, **When** staff view them, **Then** they see how many emails and how many phone numbers each household has, which numbers are opted in, declined or not yet asked, and which households are paper only.
7. **Given** staff change a number's value, **When** they save, **Then** the new number is "not yet asked": opt-in belongs to a number, not to the household.

---

### User Story 4 - Couple sends invitations and reminders by email, text or both (Priority: P1)

When the couple send a campaign, they choose email, text or both. Email goes to every email address of each household in the audience. Text goes only to numbers that have opted in. The save the date and the invitation can each be sent by email, text or both. A household with both an email address and an opted-in number gets both. Each message carries the household's personal link. The audience filters and the preview work as today, now counting messages by channel.

**Why this priority**: it is how reminders and updates reach guests who prefer texts, without ever texting someone who has not agreed.

**Independent Test**: with households that have only emails, only phones, both, and neither, and with some numbers opted in, some declined and some not yet asked, send a reminder by "both" and confirm every email address got one email, only opted-in numbers got a text, and every other number is listed as skipped with a reason.

**Acceptance Scenarios**:

1. **Given** a reminder sent by both channels, **When** it goes out, **Then** every email address gets exactly one email, every opted-in number gets exactly one text, and no other number is texted; each message carries the household's personal link.
2. **Given** the preview, **When** staff open it, **Then** each household shows how many emails and how many texts it will receive, each skipped number or household shows why (paper only, no contact on the chosen channel, not opted in, declined, reminders opted out for a non-essential type, text sending switched off, or already responded where the filter applies), and the totals are shown per channel.
3. **Given** a campaign that has already been sent, **When** it is retried or run again, **Then** no contact receives a second copy.
4. **Given** a message type with no registered text wording (a type added later without text wording, for example), **When** staff choose text or both for it, **Then** the send is refused with a plain message and nothing goes out on either channel (as for a missing email template today).
5. **Given** a household that opted out of reminders, **When** a reminder goes out by any channel, **Then** it is excluded, but an essential logistics update still goes to it.
6. **Given** a large text campaign, **When** it is sent, **Then** it is paced so that the provider's limits for the couple's registration are not exceeded, continues until every text has been sent or has failed, and does not delay sign-in texts that guests are waiting for.
7. **Given** a campaign scheduled for a later time by text, **When** the time arrives, **Then** it sends by the same rules, and a campaign scheduled before text sending is switched on sends only its emails (the texts are listed as skipped, not silently dropped).
8. **Given** a household with only a phone number that has not opted in, **When** a campaign is previewed, **Then** it is listed as skipped ("not opted in; reach them another way") so the couple know to send the link themselves.

---

### User Story 5 - Sign-in, confirmation and reminder texts come from the repository's own wording (Priority: P2)

Every text the site sends (the sign-in link text, the opt-in confirmation, the reminder, the essential update) is rendered from wording registered in this repository and sent by this repository's code. This feature writes first-draft wording, which the couple polish later.

**Why this priority**: required for P1 stories to send anything, but the wording itself is quick to replace.

**Independent Test**: with the sign-in text registered, ask for a link by phone and confirm the text is built from the registered wording. With it removed, confirm nothing is sent and the guest still sees the neutral answer.

**Acceptance Scenarios**:

1. **Given** registered wording for a message type, **When** a text of that type is sent, **Then** it is built from that wording and the household's link.
2. **Given** missing or failing wording, **When** a text is attempted, **Then** nothing is sent, the guest still sees the neutral answer, and the failure is logged without any phone number.
3. **Given** the first-draft wording, **When** a text is sent, **Then** it names the couple's wedding site and says plainly who it is from, includes the link where one belongs, and fits in a single standard text segment where the link allows, so guests are not sent several fragments.
4. **Given** the confirmation text, **When** it is read, **Then** it says the number is signed up, roughly how many messages to expect, that message and data rates may apply, and how to get help and how to stop.

---

### User Story 6 - Couple switches texting on, sees it working, and tracks delivery per number (Priority: P2)

Text sending is off until the couple have set up the provider (User Story 8) and turned the switch on. One switch in the admin console, shown only when the provider is configured, turns it on; with it off, phone numbers can still be saved but no text is sent and no consent step is shown. Once on, each text is recorded per phone number with its delivery status, and a failed text, including one refused because the recipient replied STOP, flags that number and its household for follow-up.

**Why this priority**: it keeps a half-finished setup from sending anything or asking guests for consent it cannot honour, and makes sends accountable.

**Independent Test**: with the switch off, send a "both" campaign and confirm only emails go out and the texts are listed as skipped. Turn it on, send to a household with two opted-in numbers, report a failure for one, and confirm that number and household are flagged but the other number is not.

**Acceptance Scenarios**:

1. **Given** the switch is off, **When** anyone asks for a sign-in link by phone or a campaign includes text, **Then** no text is sent, the sign-in answer is the neutral one, no consent step is shown, and the console shows plainly that texting is off.
2. **Given** a text that failed (undeliverable number, landline, carrier rejection, or the recipient opted out), **When** the status arrives, **Then** that number and its household are flagged, the console shows which number failed and why in plain words, and the other contacts are not flagged.
3. **Given** the same delivery status twice, or a later one before an earlier one, **When** they are processed, **Then** the record ends in the correct state (as for email).
4. **Given** a flagged number, **When** it is corrected or removed, **Then** the flag clears.
5. **Given** a guest who replied STOP and later replies START, **When** staff retry the text, **Then** it is delivered like any other (the site keeps no opt-out list of its own; the provider's STOP and START apply).

---

### User Story 7 - Public privacy and terms pages for the texting registration (Priority: P2)

To register with the carriers, Twilio requires a public privacy policy and a public terms page, and its reviewers open every link submitted. The site gains two plain text pages, one at a privacy path (`/privacy`) and one at a terms path (`/terms`), that anyone can read without signing in, and which the couple paste into the registration.

**Why this priority**: the registration cannot be approved without them, and texting stays off until it is approved. They are P2 only because they gate turning texting on, not building it.

**Independent Test**: in a browser with no session, open each page, confirm it loads, carries the required wording and names the couple's wedding site, and that the home page and sign-in prompt link to them.

**Acceptance Scenarios**:

1. **Given** a visitor who is not signed in, **When** they open the privacy page or the terms page, **Then** it loads as plain readable text with no sign-in prompt, redirect or personal data.
2. **Given** the privacy page, **When** it is read, **Then** it is titled "Privacy Policy", names the couple's wedding site, says what guest information is collected (names, email addresses, phone numbers, whether a number has opted in to texts, RSVP and meal answers) and what it is used for, says texts are sent only to numbers that have opted in, says how long data is kept, and states that SMS opt-in data and personal information are not sold or shared with third parties for marketing purposes.
3. **Given** the terms page, **When** it is read, **Then** it is titled "Terms & Conditions", names the couple's wedding site, and has an SMS section that says what texts guests get and how often, that agreeing to texts is optional, that message and data rates may apply, how to stop (reply STOP) and get help (reply HELP), how to contact the couple, and that carriers are not liable for delayed or undelivered messages.
4. **Given** either page, **When** a signed-in guest, a staff member or an anonymous visitor opens it, **Then** the page is the same for all of them.
5. **Given** the home page, **When** it is shown, **Then** it is unchanged except for two small plain links to these pages, so a reviewer who visits the site can find them (the pages are also reachable directly).

---

### User Story 8 - Without the text provider configured, the site works fully by email and admins are told (Priority: P1)

If the text-message provider is not configured (the settings are absent, as on every deployment before the couple finish setting it up, and on any preview or test deployment), the site behaves exactly as it did before this feature. No guest or staff screen mentions texting, nothing can send a text, and a warning banner at the top of every admin screen tells the couple and the planner that texting is not set up. Sign-in and all email, invitations included, are untouched.

**Why this priority**: texting depends on an outside registration that may take days or be refused, and the site must never show guests a feature that cannot work, so this is the safe default for every deployment.

**Independent Test**: run the whole site with no provider settings. Walk through every guest and admin screen and confirm no text-related content appears except the admin banner and the two legal pages, then run every email sign-in and invitation journey and confirm each behaves as before this feature. Add the provider settings and confirm the banner goes away and (with the switch on) the text features appear.

**Acceptance Scenarios**:

1. **Given** the provider is not configured, **When** any staff member opens any admin screen, **Then** a banner at the top says texting is not set up, that texts are off, and that email sign-in and invitations still work, and it links to the setup instructions.
2. **Given** the provider is not configured, **When** a visitor opens the sign-in prompt, **Then** it shows only the email address field and wording, with no phone field wording and no consent checkbox. A phone number typed anyway gets the same neutral answer as an unknown email address, nothing is sent and nothing is recorded.
3. **Given** the provider is not configured, **When** a guest signs in by any route, **Then** the consent step is never shown.
4. **Given** the provider is not configured, **When** staff use the household form, the import, the campaign screens, the preview, the delivery views and the settings screen, **Then** they show no phone-number fields, no phone columns in the import help, no channel choice (email only), no text counts, no opt-in or delivery columns for texts and no texting switch.
5. **Given** a spreadsheet import that includes phone columns while the provider is not configured, **When** it is imported, **Then** the phone values are ignored, not saved, and the result tells staff plainly that phone numbers were ignored because texting is not set up, so they can import them again later.
6. **Given** a campaign, a scheduled send or a retry, **When** the provider is not configured, **Then** only emails are sent, exactly as before this feature.
7. **Given** the provider is configured but the couple's switch is off, **When** anyone uses the site, **Then** texting is off as in User Story 6 (no texts, no consent step, no text content for guests) and the admin console says so plainly where texting is controlled; the not-configured banner is not shown.
8. **Given** the privacy and terms pages, **When** the provider is not configured, **Then** they still show their text-message wording, unchanged, so the carrier registration reviewers can read it.
9. **Given** provider settings are added to a deployment, **When** the site next starts or is redeployed, **Then** the banner disappears, and the text features appear only once the switch is also on. Households' stored phone numbers and opt-ins, which were hidden but never deleted, are intact.

---

### Edge Cases

- A number typed with extra characters, letters, an extension, or an international prefix other than +1: normalized if it is clearly a United States number, otherwise refused with the same plain message. Never guessed at.
- A landline or other number that cannot receive texts: the site cannot tell in advance, so a text to it counts as a failed delivery, not a rejection at entry. The consent step and prompt checkbox are the same for it.
- Two households that share a home phone: a number belongs to only one household, so the couple list it once, or give the second household a different number (the same rule as for email).
- A household's only contact is a phone number and it is removed: the household becomes paper only, with the usual warning.
- A staff member's own phone number is also a household number: allowed. Staff sign in only by email, so there is nothing to collide with, and staff addresses still cannot be household email addresses.
- A household member ticks the box for a number that belongs to someone else in the household: the household shares one account, so any signed-in member can answer for any of its numbers. The consent step says "tick only for numbers that are yours", and the couple can see which numbers are opted in and ask a guest to confirm; STOP still works for the real owner.
- Someone asks for many sign-in texts, for their own numbers or ones they do not own: limits per number and overall stop abuse and cost, without changing the neutral answer. Because unknown numbers are never texted, no text can be triggered to an arbitrary number, and no opt-in is recorded for one.
- A text link is opened first by a messaging app's automatic link preview rather than by the guest, which would use up a single-use typed-number sign-in link: the guest asks again or uses the personal link, which is not used up. The plan decides whether this needs more than that and checks it against how the leading phone messaging apps behave.
- A guest ticks the box and later replies STOP: the provider stops delivery; the site's record of the opt-in stays, later texts fail and are flagged, and the guest can opt in again by replying START to the provider and ticking the box again if they wish.
- A guest replies HELP, STOP or START: the provider handles the standard reply. Other replies from guests are not read by the site; the guest interface documentation tells guests to contact the couple.
- A guest has changed phone numbers: staff replace the number; the old number stops working for sign-in at once and the new number is not yet asked.
- A household is deleted: all its phone numbers, opt-in records and text records are removed or irreversibly anonymised under the same rule as email addresses.
- The wedding day arrives: personal links stop, texted or emailed alike; typed-number sign-in links keep working, as typed-address links do.
- Provider outage or credentials missing while the switch is on: texts fail and are flagged as failed deliveries, sign-in still gives the neutral answer, and the failure is logged without any phone number. Opt-ins are still recorded; only the confirmation text fails.
- A guest signs in on a shared or public computer and ticks a box: the opt-in is for the number, not the device, and is recorded once.

## Requirements _(mandatory)_

### Functional Requirements

**Phone numbers as contacts**

- **FR-001**: A household MUST be able to have zero or more phone numbers alongside zero or more email addresses. Any one contact of either kind is enough to be reachable and to sign in; no contact means paper only.
- **FR-002**: Only United States phone numbers MUST be accepted. Other +1 numbers (including Canada) and malformed numbers MUST be refused with a plain message pointing the couple to email instead.
- **FR-003**: Every phone number MUST be stored in one standard form, so that the same number typed in different formats is recognised as the same. A number MUST belong to at most one household. A repeat MUST be refused with a plain message.
- **FR-004**: Only the couple and the planner MUST be able to add, change and remove a household's phone numbers; guests MUST NOT, though a signed-in guest MAY see their own household's numbers, masked as email addresses are. The guest-list import MUST accept several phone columns per household, with per-row, per-column errors, in both spreadsheet formats it already accepts. Removing the last contact of any kind MUST warn that the household becomes paper only. Removing a number MUST stop it being used to ask for a sign-in link immediately.
- **FR-005**: The data design MUST keep email and phone numbers as the same kind of thing (a contact with a channel), so that every rule below applies to both without a parallel copy of the machinery.

**Consent**

- **FR-006**: The system MUST record, for each phone number, whether it is not yet asked, opted in or declined, with when it changed and where the answer was given (the consent step or the sign-in prompt). The record belongs to the number: it is removed with the number, and changing a number's value resets it to not yet asked. The couple and the planner MUST be able to see it whenever texting is available; guests MUST NOT be able to see another household's.
- **FR-007**: A number MUST NOT be sent any text of any kind (sign-in, campaign or confirmation) unless its opt-in has been recorded. The one exception is the confirmation text sent as part of recording it (FR-010). No import, edit, campaign or staff action may mark a number as opted in; only a guest's ticked checkbox can.
- **FR-008**: When texting is available and a guest signs in for the first time by any route, and their household has any number that is not yet asked, the site MUST show the consent step before anything else. It MUST list each such number (masked) with its own checkbox, unticked by default, with the consent statement (FR-009) once, links to the privacy and terms pages, and a single button that saves all answers. A ticked box opts the number in; an unticked box records declined and the step MUST NOT return for that number. Any signed-in member can answer. The step MUST NOT be shown when texting is not available.
- **FR-009**: The consent statement MUST be shown with every consent checkbox (the consent step and the sign-in prompt), and MUST: name the couple's wedding site; say what texts the guest will get (reminders, essential updates and sign-in links) and roughly how often (about a dozen messages over about six months); say that message and data rates may apply; say how to opt out (reply STOP) and get help (reply HELP); say that texts are optional and email is always available; and link to the privacy and terms pages. The statement and checkbox MUST be separate from any agreement to the privacy policy and terms. It MUST be the same for every visitor and MUST NOT reveal whether a number is known. Screenshots of it are used for the registration.
- **FR-010**: When a number's opt-in is recorded, one confirmation text MUST be sent to it at once, saying it is signed up, roughly how many texts to expect, that message and data rates may apply, and how to get help and stop. It is sent once per opt-in, not again for repeated ticks.
- **FR-011**: The save the date and the invitation MUST each have a text version and MUST be sendable by email, text or both. No text is ever sent to a number before its opt-in. A household with both an email address and an opted-in number MUST receive both when the channel is both. A household with no email address and no opted-in number MUST be listed in the preview as skipped for "not opted in" so the couple reach it another way (a paper invitation with the site address, or a personal message with its personal link).

**Signing in**

- **FR-012**: A personal invite link MUST work identically whether it arrived by email or by text: same expiry, same reissue behavior, same effect on every device, same failure page, same RSVP-deadline behavior. Nothing about it is specific to a channel, including in the save the date and invitation texts.
- **FR-013**: A guest MUST be able to ask for a short-lived sign-in link by typing any one phone number of their household, ticking the consent checkbox (FR-009), and the link MUST be texted only to the number typed and MUST sign in to the same household as the personal link. Typing a number without ticking the checkbox MUST NOT send anything.
- **FR-014**: The sign-in prompt MUST accept an email address or a phone number in one field and decide which it is, without a channel picker. The checkbox appears only for a phone number; email needs none. An entry that is not an email and not a recognisable phone number MUST get the same neutral answer as an unknown one. When texting is not available, the prompt MUST show email-only wording and no consent checkbox, and a phone number typed anyway MUST get the same neutral answer with nothing sent or recorded (FR-040).
- **FR-015**: Asking for a link by phone MUST never create an account and MUST never reveal whether a number is on the guest list. The answer, status, wording and response time MUST be the same for known numbers, unknown numbers, non-US numbers, numbers over their limits, and when texting is not available. The wording MUST cover both channels, so it never shows which kind was typed. An unknown number MUST NOT have anything recorded for it.
- **FR-016**: The system MUST limit sign-in link requests per phone number and overall, without changing the neutral answer, with the same mechanism and the same settings-without-code-changes as for email. Limits MUST be tracked without storing the number itself. A flood of requests MUST NOT be able to cause texts to anyone not already on a household.
- **FR-017**: Staff sign-in MUST stay on email links. Staff do not sign in by phone.
- **FR-018**: A guest who has signed in by any route (email link, text link, personal link) MUST stay signed in on that device indefinitely, under exactly the rules in the invite links spec, whichever channel the link came by. "Sign out everywhere" and reissuing the link MUST apply to a household regardless of channel.

**Campaigns and messages**

- **FR-019**: A campaign MUST let staff choose email, text, or both. Email MUST go to every email address of each household in the audience; text MUST go only to numbers that have opted in (FR-007), exactly one message per contact. All existing audience filters MUST work unchanged.
- **FR-020**: Reminder and essential-update wording for texts MUST be given the household's personal link. A send MUST remain idempotent per contact: re-running or retrying MUST NOT send any contact a second copy, on either channel.
- **FR-021**: The existing reminder opt-out MUST apply to a household across both channels: non-essential types are excluded; essential logistics updates are still sent.
- **FR-022**: The preview MUST show per household how many emails and how many texts will go out, per skipped household or number why (including "not opted in" and "declined"), and totals per channel. It MUST say when text is chosen but sending is switched off.
- **FR-023**: A message type MUST NOT be sent by a channel for which it has no registered wording; the send MUST be refused whole, with a plain message naming the missing wording, and nothing goes out on either channel.
- **FR-024**: Text sending MUST be paced to the provider's limits for the couple's registration and MUST resume across runs until every text is sent or failed, never dropping a text for lack of capacity and never exceeding the limits. Texts that guests are waiting for (typed-number sign-in links and confirmations) MUST NOT be stuck behind a bulk campaign.

**Text sending and delivery**

- **FR-025**: Texting MUST be available only when the provider is configured (FR-040) and a single master switch, controlled by the couple, is on. The switch MUST be off until the couple turn it on. With either one off, nothing is texted (sign-in, confirmation or campaign) and no consent step is shown. When the provider is configured but the switch is off, phone numbers can still be stored and edited, and the console MUST show the state plainly where the switch is.
- **FR-026**: Each text MUST be recorded per phone number: household, the number used at the time, message type, campaign, timestamp and delivery status (the existing statuses). Delivery notifications from the provider MUST update it, tolerating duplicates and out-of-order arrival, as for email. A notification MUST be accepted only if it can be verified as coming from the provider.
- **FR-027**: A failed text MUST flag that number and its household for follow-up, counted with existing delivery problems, and the flag MUST clear when the number is corrected or removed. A text refused because the recipient opted out (STOP) counts as a failed delivery. The site MUST NOT keep its own opt-out list; the provider's standard STOP, START and HELP handling is relied on.
- **FR-028**: The console MUST show, per phone number, its opt-in state and the latest delivery status in plain words, including why a text failed where the provider says.

**Wording**

- **FR-029**: This feature MUST write first drafts of the wording and plain templates for the sign-in text, the opt-in confirmation text, the reminder text, the essential-update text, the save the date text and the invitation text, registered in the repository and covered by tests, under the couple's existing permission to write first-draft wording for texts (recorded in `CLAUDE.md`). The couple polish them later. No visual design is involved.
- **FR-030**: The first-draft texts MUST say who they are from, include the link where one belongs, and be as short as the content allows. They MUST NOT contain a guest's name or any other personal details beyond what an email of the same type already contains.

**Admin console v0**

- **FR-031**: The temporary admin console MUST let staff view and edit a household's phone numbers; show phone counts, opt-in state and paper-only state in the household list and detail; accept several phone columns in the import (with import help updated); choose the channel(s) of a campaign; show per-contact delivery in the preview, delivery status, overview and reports; and show and change the master switch. It MUST stay plain and use the existing single stylesheet. All of this, apart from the banner, is shown only as FR-041 and FR-043 allow.

**Guest-facing changes (a narrow exception)**

- **FR-032**: The placeholder homepage's sign-in prompt MUST accept a phone number and show the consent checkbox as described in FR-013 and FR-014; the homepage MUST show the consent step (FR-008) to a signed-in guest who has numbers to answer for; and it MUST gain two small plain links to the privacy and terms pages. These, the consent step and the two pages are the only guest-facing changes; the placeholder's other behavior and wording stay as they are, apart from the neutral answer's wording. The designer may replace or restyle them, provided the required wording and an unticked checkbox stay. All of it, apart from the two pages and their links, is shown only when texting is available (FR-042).

**When the text provider is not configured**

- **FR-040**: The system MUST treat the text provider as configured only when the server has every provider setting it needs to send a text, and as not configured otherwise. While it is not configured, every text feature MUST be disabled: no text is sent by any route (sign-in, confirmation, campaign or scheduled send), no opt-in is recorded, no phone sign-in is offered, and provider delivery notifications are ignored. The switch in FR-025 MUST NOT be able to turn texting on.
- **FR-041**: While the provider is not configured, every admin screen MUST show a warning banner at the top, visible to the couple and the planner, saying plainly that texting is not set up, that texts are off, that email sign-in and invitations are unaffected, and where the setup instructions are. The banner MUST NOT appear when the provider is configured, and MUST NOT appear on any guest-facing screen.
- **FR-042**: While texting is not available (not configured, or switched off), no guest-facing screen may show any text-related content: no phone sign-in wording, no consent checkbox, no consent step, and no mention of texts. The two public legal pages (FR-033 to FR-035) are the one exception and always show their text-message wording, because the carrier registration requires it to be readable before texting is switched on.
- **FR-043**: While the provider is not configured, the admin console MUST show no text-related content except the banner: no phone-number fields in the household form or detail, no phone columns in the import or its help, no channel choice in campaigns (email only), no text counts, opt-in state or delivery columns, no texting switch and no text wording in the settings. A phone number in an import MUST be ignored, not saved, and the result MUST say so. While the provider is configured but the switch is off, the console MAY show the text fields and MUST show the off state plainly.
- **FR-044**: Phone numbers and opt-in records already stored MUST NOT be changed, deleted or exposed by the provider becoming unconfigured; they are hidden and come back when texting is available again. Households whose only contact is a phone number MUST be shown to staff as reachable by neither channel while texting is not available.
- **FR-045**: Everything that worked by email before this feature MUST work identically whether or not the provider is configured: sign-in by email (guests and staff), personal links, invitations, reminders, delivery tracking and the email templates. A failure or absence on the text side MUST never delay, block or change an email.

**Privacy and terms pages**

- **FR-033**: The site MUST serve a privacy policy page and a terms page, each at its own fixed public path (`/privacy` and `/terms`), readable by anyone without signing in and identical for every visitor. They MUST be plain text under the one existing homepage stylesheet, with no new design system, theming library or component library.
- **FR-034**: The privacy page MUST be titled "Privacy Policy", name the couple's wedding site, describe the guest information collected and its use, say that texts go only to numbers that opted in, say how long it is kept (all guest data deleted and the database taken down within a few weeks of the wedding) and how a guest asks the couple to correct or delete it, and state that SMS opt-in data and personal information are not sold or shared with third parties for marketing purposes.
- **FR-035**: The terms page MUST be titled "Terms & Conditions" (or "Terms of Service"), name the couple's wedding site, and include an SMS section stating the kinds of texts sent and their approximate frequency, that agreeing to texts is optional, that message and data rates may apply, how to opt out (STOP) and get help (HELP) (both in bold), the couple's contact details for support, a link to the privacy page, and a statement that carriers are not liable for delayed or undelivered messages. The required wording comes from Twilio's current registration requirements, which the plan checks again before the pages are written.
- **FR-036**: The pages MUST contain no guest data and MUST be covered by tests, including that they load without a session and carry the required wording. Their wording is a first draft for the couple to read and polish; it is not legal advice.

**Privacy, setup and documentation**

- **FR-037**: Phone numbers and opt-in records are personal data. They MUST NOT appear in logs, error messages shown to guests, or the change history (field names only), and fixtures and seed data MUST use numbers from the fictional range reserved for such use (555-0100 to 555-0199). Deleting a household MUST remove or irreversibly anonymise its phone numbers, opt-in records and text records.
- **FR-038**: The guest and admin interface documents, the manual setup document, the architecture document, the constitution's and `CLAUDE.md`'s statements about sign-in and scope, and the decision records MUST be updated in the same change: the neutral answer's new wording, the phone-number sign-in, the consent step and opt-in record, the channel choice, what the couple must set up by hand with the provider (account, number, registration, delivery notifications, and the master switch), the provider settings the server needs and that texting is off and hidden without them, and the admin banner. The provider choice and the change from "no consent tracking" to recorded opt-in MUST be recorded as decisions.
- **FR-039**: The setup steps that cannot be done in code MUST be written for someone doing them for the first time, with secrets handled like the existing ones. They MUST cover, in order: confirming eligibility (no business tax ID); creating and upgrading the Twilio account; buying a United States local number; putting the provider's settings on the hosting environment (never in the repository), which is what ends the not-configured state; registering the brand (including the one-time text to a mobile phone that must be answered within 24 hours); registering the campaign (use case, description, how guests agree, proof of that, links to the privacy and terms pages, and at least two sample texts that name the couple's site and include "text STOP"); and waiting for approval, which can take up to about five business days, with texting staying off until then. They MUST say how to fix and resubmit a rejected campaign, and that the opt-in described in the registration must match what the site really does.

### Key Entities

- **Household contact (changed)**: gains the phone number as a second kind alongside email. One value belongs to one household, unique across households within its kind, with a delivery-problem flag.
- **Phone opt-in record (new)**: for each phone number: not yet asked, opted in or declined, with when it changed and where the answer was given. Removed with the number; reset when the number changes.
- **Message (changed)**: one email or text to one contact in one campaign; records the channel and the contact used.
- **Campaign (changed)**: gains the choice of email, text or both.
- **Message type (changed)**: each type declares which channels it has wording for; the save the date and the invitation each have text wording.
- **Texting setting (new)**: the master on/off switch, off by default. Texting is available only when this is on and the provider is configured.
- **Provider configuration (new, not stored data)**: whether the server has the text provider's settings. Read from the deployment, never edited in the console.
- **Admin banner (new)**: the not-configured warning shown on every admin screen.
- **Text wording**: the registered first-draft wording for the sign-in, confirmation, reminder and essential-update texts.
- **Privacy page and terms page (new)**: two public, static text pages carrying the wording the registration requires.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A guest who has opted in and receives a reminder text reaches their household in one tap from the text, with no sign-up, password or code, in under 30 seconds, the same as by email.
- **SC-002**: 0 texts of any kind are sent to a number that has not opted in, across campaigns, sign-in requests and imports, checked by an automated test over every route that can send a text.
- **SC-003**: For known and unknown phone numbers, and for numbers outside the United States, the on-screen answer is identical in content and arrives within 250 milliseconds of one another on average; 0 accounts are created, 0 texts are sent and 0 opt-ins are recorded for any number not on a household.
- **SC-004**: Once opted in, a household with only a phone number can complete every guest journey that an email-only household can, with no step requiring an email address: 100% of the guest journeys in the invite links spec's user stories, run once with an email-only household and once with an opted-in phone-only household, pass.
- **SC-005**: A campaign, including when retried, sends each contact exactly one message and no contact two, on both channels.
- **SC-006**: 100% of repeated, non-US or invalid phone numbers in an import of at least 200 rows are reported by row and column and none is saved; the same number typed in different formats is always treated as one number; none of the imported numbers is texted.
- **SC-007**: With texting off, 0 texts are sent by any route, no consent step is shown, and the console says so.
- **SC-008**: A reminder texted to 100 opted-in numbers completes with every text sent or recorded as failed, none dropped for rate reasons, and a sign-in text requested during the send arrives within 1 minute.
- **SC-009**: 100% of texts sent in production are rendered from wording registered in the repository.
- **SC-010**: Both the privacy and terms pages load for a visitor with no session in under 2 seconds on an ordinary connection and contain every required statement in FR-034 and FR-035, checked by an automated test.
- **SC-011**: A guest who opts in receives exactly one confirmation text within 1 minute, and a guest who declines receives none.
- **SC-012**: With the provider not configured, 0 texts are sent and 0 opt-ins recorded by any route, and 0 guest-facing or admin screens (other than the admin banner and the two legal pages) contain text-related content, checked by an automated test that renders every guest and admin screen with no provider settings.
- **SC-013**: With the provider not configured, 100% of the email journeys in the invite links spec's user stories (personal link, typed-address sign-in, staff sign-in, invitations, reminders, delivery tracking) pass with results identical to before this feature, and every admin screen shows the not-configured banner.

## Assumptions

- **Provider: Twilio**, confirmed by the couple on 2026-11-10. The plan records it as a decision. The requirements do not otherwise depend on the provider.
- **Registration is more than a few forms, and is the carriers' requirement, not Twilio's.** This corrects the invite links spec's estimate of "about 15 minutes of forms and a few days' wait". For individuals without a business tax number, Twilio registers a "sole proprietor" brand and campaign ([Twilio's registration guide](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview-new%20experience), updated 2026-10-30). Beyond the forms it requires: a one-time text code to a mobile phone (answered within 24 hours), a detailed campaign description that matches the sample texts, a description and proof of how guests agree to be texted, at least two sample texts that name the brand and include opt-out wording, a real working website, and public privacy and terms pages with specific wording (FR-033 to FR-035). Twilio says a non-compliant opt-in description is the most common reason campaigns are rejected, that the brand is usually approved within minutes and the campaign within about five business days (contact support after ten), and that a rejected campaign can be fixed and resubmitted. Other providers and toll-free numbers were checked and do not avoid these checks.
- **Costs** (Twilio's pages name these fees but the dollar amounts come from search summaries of Twilio's pages, so confirm them on the console's fee screen before paying): about $4 one-time for the brand (one older Twilio article says $4.50), $15 one-time campaign vetting, $2 a month for the campaign ([Twilio's fee FAQ](https://support.twilio.com/hc/en-us/articles/4407882914971-Comparision-between-Starter-and-Standard-registration-for-A2P-10DLC)), and about $1.15 a month for a United States local number ([Twilio phone numbers](https://twilio.com/en-us/phone-numbers)). Per-text prices are not yet checked.
- **Provider limits shape the design.** Twilio documents that a sole proprietor registration is limited to one campaign, one phone number per campaign and one message per second ([Twilio, "Message throughput and trust scores"](https://support.twilio.com/hc/en-us/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US)). Two third-party summaries (Zuper's and Salesmate's documentation) give a T-Mobile daily cap of about 1,000 messages for this tier; that figure is not yet confirmed by Twilio or T-Mobile directly, so the plan verifies it. The couple expect about 100 recipients and about a dozen texts each over about six months, well under that cap, and FR-024's resume-across-runs behavior covers any larger send.
- **STOP, START and HELP are handled by the provider.** Twilio's default opt-out words are STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT, matched case-insensitively; after one, further texts to that person from that number fail with a documented "unsubscribed recipient" error until they reply START ([Twilio on opt-out keywords](https://support.twilio.com/hc/en-us/articles/223134027-Twilio-Support-for-Opt-out-Keywords-SMS-STOP-Filtering), [error 21610](https://www.twilio.com/docs/api/errors/21610)). That failure is what the site records; it keeps no opt-out list of its own, only the opt-in record.
- **Opt-in is recorded by the site, replacing "no consent tracking".** On 2026-10-29 the couple decided not to track consent and to vouch for their guests; on 2026-11-11 they replaced that with a normal consent checkbox on first sign-in, because the registration needs a real opt-in and verbal consent did not meet the carriers' script requirements. Twilio's guidance asks that consent be active and optional: the checkbox is unticked by default and agreeing is never a condition of using the site (Twilio's errors on [consent language](https://www.twilio.com/docs/api/errors/30924) and [required consent](https://www.twilio.com/docs/api/errors/30923)). The system does not enforce quiet hours; the couple choose when to send. Nothing here is legal advice.
- **United States only** by the couple's explicit decision. The plan decides how to recognise United States numbers reliably (including the +1 numbers that are not US) and how to verify it.
- **Same link, not a code**: Supabase's own phone sign-in is not used; the site texts a link exactly as it emails one, and the provider only delivers messages. The household's sign-in account is unchanged: it has no real email address or phone number, which live with the contacts.
- **Provider notifications** for delivery status arrive the way Resend's do today; the plan decides how they are verified.
- **Fictional numbers**: numbers 555-0100 to 555-0199 are reserved for fictional use ([Wikipedia's summary of the North American Numbering Plan's reservation](<https://en.wikipedia.org/wiki/555_(telephone_number)>)), so fixtures and seed data cannot reach a real person.
- **Scope.** Guest-facing screens other than the placeholder homepage's sign-in prompt, its consent step and its two new links, and the privacy and terms pages (a narrow exception granted by the couple on 2026-11-10 and extended on 2026-11-11 to the consent step, to be recorded in `CLAUDE.md` and a decision record by this feature), stay out of scope; the guest interface changes are documented for the designer's frontend (FR-038). The rule against writing message content is lifted for first-draft texts only, by the couple's permission on 2026-10-29, which is already recorded in `CLAUDE.md`. Texts are plain text: no images, no pictures, no visual design.
- **Decisions this feature touches** (the plan records them): the household sign-in decision (`docs/decisions/0011-household-sign-in-and-invite-links.md`) says typed-address links come from the `magic_link` template by email and gains a phone path; the constitution says email delivery is by Resend and sign-in is "magic-link for everyone", which still holds (a text link is a magic link) but whose Email line needs a text-delivery companion.
- **"Configured" means the provider's settings are present on the deployment**, the same way the email provider's key is today (set on the hosting environment, never committed, server-only). Which settings are needed (for example an account identifier, a secret and a sending number or messaging service) and whether the server also checks them against the provider are planning questions. Preview and test deployments are unconfigured unless set up, so they are email-only by default.
- **Existing limits and rules are unchanged**: guests never create accounts themselves, sign-in never reveals who is on the guest list, the personal link closes on the wedding day, and the RSVP deadline never closes a link.
