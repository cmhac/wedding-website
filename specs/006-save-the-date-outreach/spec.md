# Feature Specification: Save the date outreach

**Feature Branch**: `006-save-the-date-outreach` (work happens on the session branch; the spec directory name does not dictate it)

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description (2026-11-11), in the couple's words: "I want to have this site ready to go by the time we send our save the dates. By that point we'll have the visual design ready to go. In the meantime we can build everything else around it and make sure that it's ready. The flow I want is that we'll upload the guest data and set up households and contact info. If guests have pre-consented to sms they'll be marked as such in the database. Then we'll put the physical save the dates in the mail and at the same time send email and optionally sms alerts to the guests. The emails will carry the look and feel of our site and invitations, which will match, and will have a link for guests to click that will take them to the site, sign in the device they're using (magic link, not 6 digit code if possible), and then show them a save the date page which will have the same info on it as the physical save the date but also a button to add the date to their calendar via Google Calendar, Apple Calendar, Outlook, or other calendar format. For pre-consented sms guests, they'll also receive an sms message telling them this is Chris and Hannah, time to save the date, and the same link, which will auth their device and show them the save the date page."

**Update (2026-11-11, mid-review)**, in the couple's words: "We will now support pre-consented guests, with an option to mark individual guests as consented by the couple or planner within the UI, and the ability to batch-edit guests in the admin page and batch-mark them as consented."

This feature builds on the personal invite links spec ([`specs/003-personal-invite-links/spec.md`](../003-personal-invite-links/spec.md)), the text-message spec ([`specs/005-sms-support/spec.md`](../005-sms-support/spec.md)) and the placeholder homepage spec ([`specs/004-placeholder-homepage/spec.md`](../004-placeholder-homepage/spec.md)). Their decisions carry over unchanged unless this spec says otherwise. Where it does change one, "What this changes in earlier decisions" lists it.

## Background

What already exists, found by reviewing the repository on 2026-11-11:

- **The sign-in half of the flow works.** A household's personal link signs in any number of devices, is not used up by a mail scanner or link preview, survives until the wedding day, and works the same whether it arrived by email or text. There is no typed code anywhere in the guest flow: every route is a link. The couple's "magic link, not a code" requirement is already met.
- **Sending works.** Campaigns go out by email, text or both, once per contact, scheduled or immediate, with a preview, pacing for texts and per-contact delivery tracking. "Save the date" is already a message type, and it already has a first-draft text. It has **no email**: the email template is unregistered, so choosing it today refuses to send.
- **Where a signed-in guest lands is one fixed place.** Every personal link ends at one landing path (the placeholder homepage until the designer's pages exist). The link cannot tell a save-the-date message from an invitation, so it cannot send a save-the-date reader to a save-the-date page.
- **No save the date content exists.** Nothing holds what the physical card says, nothing offers a calendar file or calendar links, and no guest endpoint returns the date.
- **Pre-consent cannot be recorded.** The text-message spec decided that only a guest's own ticked checkbox can mark a number as opted in, and the database enforces it: staff, imports and campaigns cannot write the consent record. So today no number can be texted until its guest has signed in and ticked the box, which is the opposite of the couple's plan for the first outreach.
- **No batch editing exists** in the admin console, and the import has no consent column.
- **Nothing tells the couple whether a household has opened its link**, and there is no way to send a test to themselves before the real send.

The couple's designer owns every guest-facing screen beyond the placeholder homepage. This feature therefore builds what the save the date page needs (its content, its calendar files, the right landing, the messages that lead to it) and documents it for the designer. It does not build the page.

Plain-language terms used below:

- **Household**, **contact**, **personal invite link**, **campaign**, **paper only**, **opted in**, **texting available**: as in the earlier specs.
- **Save the date page**: the guest-facing page the designer builds, showing what the physical card shows plus the add-to-calendar choices.
- **Save the date details**: the handful of facts the card shows (the wedding date, where, and a short line of text), kept in one place for the page, the email, the text and the calendar entry.
- **Pre-consented**: a phone number whose owner agreed to be texted before the site was involved, and which the couple or planner have marked as opted in, rather than the guest ticking the box themselves.
- **Batch edit**: choosing several households in the admin console and applying one change to all of them.

## Clarifications

### Session 2026-11-11

- Q: Can numbers be marked as consented by the couple? → A: Yes. The couple or the planner can mark an individual number as consented in the admin console, and can mark many at once with a batch edit. (The couple's mid-review message above.)
- Q: Can the guest-list import carry the consent mark too? → A: Yes, assumed from the couple's original description ("if guests have pre-consented to sms they'll be marked as such in the database"): the import accepts a consent column next to each phone number. The couple may confirm or drop this at planning.
- Q: Is the save the date page built here? → A: No. The designer builds it. This feature supplies its content, calendar files and landing behavior, and documents them. Until the designer's page exists, opened links keep landing on the placeholder homepage.
- Q: Who writes the save the date email wording? → A: The couple, or the designer's email design. This feature registers the template slot, defines what it receives, and tests it with a fixture; it ships no real wording or design. (The couple's earlier permission to draft email wording covers only the sign-in, invitation and reminder emails.) The text wording already has a first draft, which this feature revises to the couple's description.
- Q: Which calendars? → A: Google Calendar, Apple Calendar and Outlook by name, plus a standard calendar file that any other calendar opens.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest taps the link and lands on the save the date (Priority: P1)

A guest opens the save the date email, or the text, and taps the link. Their device is signed in, and they see the save the date page: the same facts as the card in their hands. They do nothing else: no code, no sign-up, no password.

**Why this priority**: it is the whole point of the outreach, and it is the piece of the flow that does not work today (the link has nowhere to land except the one fixed path).

**Independent Test**: send a save the date to a test household, open the link from the email on one device and the text on another, and confirm both are signed in and land on the save the date page's address, with the save the date details available to the page.

**Acceptance Scenarios**:

1. **Given** a household that was sent a save the date, **When** a guest opens the personal link from that email or text, **Then** their device is signed in as the household and they land on the save the date page.
2. **Given** an invitation (a later campaign), **When** a guest opens its personal link, **Then** they land on the RSVP as they do today, not on the save the date page. The same household link serves both; which message it came from decides where it lands.
3. **Given** the same link opened again weeks later on a new device, **When** it is opened, **Then** it still signs in, and lands in the place appropriate to the link's message (a save the date link still shows the save the date).
4. **Given** a signed-in guest, **When** the designer's page asks for the save the date details, **Then** it receives the wedding date, the place line, the note line and the calendar choices, and nothing about any other household.
5. **Given** a visitor who is not signed in, **When** they ask for the save the date details, **Then** they are refused, as for the RSVP.
6. **Given** a guest with an unanswered phone number and texting available, **When** they land on the save the date page, **Then** the save the date comes first and the text consent step is offered after it, never in front of it. (This changes the text-message spec's "before anything else"; see "What this changes".)
7. **Given** a link that is reissued, made up, or opened on or after the wedding day, **When** it is opened, **Then** the plain failure page appears, as today.
8. **Given** the RSVP has not opened yet, **When** a save the date reader signs in, **Then** nothing invites them to RSVP, and an attempt to save answers is refused as "not open yet" (the existing RSVP on/off setting).

---

### User Story 2 - Guest adds the date to their calendar (Priority: P1)

On the save the date page the guest can add the wedding date to Google Calendar, Apple Calendar, Outlook, or any other calendar, in one tap each.

**Why this priority**: the couple asked for it, and it is the main thing the page does beyond the card.

**Independent Test**: for the wedding event, fetch the calendar file and each calendar link, check the file against the calendar-file standard, and open the file in a real Apple, Google and Outlook calendar to see one all-day entry on the right date.

**Acceptance Scenarios**:

1. **Given** the save the date details, **When** a guest chooses Google Calendar, **Then** Google Calendar opens a new all-day entry on the wedding date, titled with the couple's wedding, with the place and a short note filled in, awaiting their confirmation.
2. **Given** the same details, **When** a guest chooses Outlook, **Then** Outlook (on the web) opens the same entry. **When** they choose Apple Calendar or "other", **Then** a standard calendar file downloads and opens in Apple Calendar, Outlook desktop and other calendar programs as the same entry.
3. **Given** a wedding date that is a single day, **When** the calendar file is built, **Then** the entry is an all-day entry on that date only (not the day before or after, and not spanning two days), whatever the guest's time zone.
4. **Given** a calendar entry, **When** a guest later shares or forwards it, **Then** it contains no personal link, no sign-in token, no household name and no guest data, only the public wedding facts and the site's address.
5. **Given** the couple later change the save the date details (for example the place line), **When** a guest re-downloads the calendar file, **Then** it carries the new details, and its identity is stable so that calendar programs that match on it replace the earlier entry rather than adding a second one.
6. **Given** the date or place is not yet set, **When** the calendar choices are requested, **Then** they are withheld with a plain reason, rather than producing an entry with a wrong date.

---

### User Story 3 - Couple marks guests as pre-consented to texts (Priority: P1)

Some guests agreed to be texted before the site existed (for example, when the couple collected addresses and numbers). The couple or planner mark those numbers as consented: one at a time on a household's page, many at once by batch edit in the household list, or by a consent column in the spreadsheet import. Marked numbers are texted by the save the date campaign without the guest having to sign in and tick a box first.

**Why this priority**: without it no guest can be texted in the first outreach, which is the couple's plan, and the existing rule forbids staff from doing it.

**Independent Test**: import a spreadsheet with three households, one number marked consented, one not marked, one marked consented but invalid; mark a second number on its household page; select two households and batch-mark their numbers; then preview a save the date by text and confirm exactly the marked numbers will be texted.

**Acceptance Scenarios**:

1. **Given** a household's page, **When** the couple or planner mark one of its phone numbers as consented, **Then** the number is recorded as opted in, noting who marked it, when, and that it was marked by staff (not by the guest), with an optional short note on where the consent came from (for example "address form, October").
2. **Given** the household list, **When** staff select several households and choose "mark as consented", **Then** every phone number of every selected household that is not already opted in is marked, and a summary says how many numbers were marked, how many were already opted in, and how many households had no phone number.
3. **Given** a batch edit, **When** staff review it before applying, **Then** they see how many households and numbers it covers and must confirm; nothing changes until they do.
4. **Given** a number that **declined** at the site's consent step, **When** staff try to mark it consented, **Then** they are told it declined and must confirm to override. A number whose owner replied STOP at the provider stays refused by the provider whatever the record says, and the console says so.
5. **Given** an import file with a consent column beside a phone number, **When** it is imported, **Then** numbers marked yes are recorded as opted in "by import", blank or no leaves the number not yet asked, and an unrecognised value is reported by row and column with that household skipped, as for other bad rows.
6. **Given** a number marked as consented, **When** a guest from its household signs in, **Then** the text consent step does not ask about that number again. Numbers still not asked are asked as before.
7. **Given** a number's value is changed, **When** staff save, **Then** its consent mark is cleared and the number is not yet asked (consent belongs to a number, not a household), and staff are warned of this before saving.
8. **Given** a marked number, **When** staff clear the mark, **Then** it returns to not yet asked and is no longer texted.
9. **Given** the household list and detail, **When** staff view them, **Then** each number shows its consent state and how it was recorded (the guest's own tick on the site, marked by staff, or imported), and the list can be filtered to numbers not yet consented.
10. **Given** only the couple or planner role, **When** anyone else (a guest, or an unsigned-in visitor) tries to mark consent, **Then** it is refused.
11. **Given** texting is not available (not configured, or switched off), **When** staff look at the console, **Then** marked numbers are still kept and shown, and no text is sent, as for every other text feature.

---

### User Story 4 - Couple sends the save the date by email and text at the same time as the mail (Priority: P1)

On the day the physical cards go in the post, the couple send one save the date campaign by email and text. Every email address gets the email. Every opted-in number (marked by staff, imported, or ticked by the guest) gets the text. Each carries the household's personal link, which lands on the save the date page. The campaign can be scheduled to go out at a chosen time.

**Why this priority**: it is the moment the whole site exists for. Most of the machinery exists; what is missing is the email, the right landing, and a send window.

**Independent Test**: with households that have email only, both, text only (consented), text only (not consented), and neither, schedule a save the date by both channels, and confirm one email per address, one text per opted-in number, every other contact listed as skipped with a reason, and nothing sent twice if the send is run again.

**Acceptance Scenarios**:

1. **Given** a save the date campaign by email and text, **When** it goes out, **Then** every email address gets exactly one email and every opted-in number exactly one text, each containing that household's personal link, and no number that is not opted in is texted.
2. **Given** the first text any pre-consented number receives, **When** it arrives, **Then** it says who it is from in the couple's words (that it is Chris and Hannah and it is time to save the date), carries the link, and carries the required disclosures: message and data rates may apply, how to get help, and how to stop. A pre-consented number is not sent a separate confirmation text when it is marked; the first message does that work. (A guest who ticks the box on the site still gets the existing confirmation text.)
3. **Given** the save the date email has no registered template, **When** staff choose email or both, **Then** the send is refused with a plain message and nothing goes out on either channel.
4. **Given** the preview, **When** staff open it, **Then** it shows per household how many emails and texts will go out, each skipped contact and household with its reason (paper only, not opted in, declined, text sending switched off, and so on), per-channel totals, how many households are reachable by neither channel, and how many numbers are pre-consented.
5. **Given** a campaign scheduled for the day the cards are posted, **When** the time arrives, **Then** it goes out by the same rules, and one scheduled before texting is switched on sends only its emails, with the texts listed as skipped.
6. **Given** a send time for texts outside 11 a.m. to 9 p.m. Eastern time, **When** staff schedule it or send it now, **Then** they are warned that some guests in the continental United States would receive it before 8 a.m. or after 9 p.m. their time, and may proceed. The system warns; it does not refuse.
7. **Given** a send that is retried or run again, **When** it runs, **Then** no contact receives a second copy.
8. **Given** a household that is paper only, **When** the campaign is previewed, **Then** it is listed as reached by post only, so the couple can see who depends on the card.
9. **Given** a household with only a number that is not opted in, **When** the campaign is previewed, **Then** it is listed as "not opted in; reach them another way", as the text-message spec already requires.

---

### User Story 5 - The card's facts live in one place (Priority: P2)

The couple enter the save the date details once: the wedding date, the place line, and a short note (for example "Invitation to follow"). The save the date page, the email, the text and the calendar entry all draw from that one record, and staff can see a preview of each.

**Why this priority**: it stops the page, email, text and calendar disagreeing with each other and with the printed card, and it lets the couple correct a typo in one place. It is P2 because the first outreach can be checked by eye without it.

**Independent Test**: change the place line, then confirm the guest endpoint, the email props, the text and the calendar file all show the new line.

**Acceptance Scenarios**:

1. **Given** the details are saved, **When** any of the page, email, text or calendar entry is produced, **Then** each uses that same saved wording and date.
2. **Given** the wedding date comes from the wedding event already chosen in the settings, **When** the details are shown, **Then** the date is that event's date (not typed a second time), and a missing date is reported as "not ready".
3. **Given** staff open the details in the admin console, **When** they save a change, **Then** it takes effect everywhere at once, and the change is recorded in the change history (field names only, as today).
4. **Given** the couple's names in the settings, **When** the entry or message needs the couple's names, **Then** it uses them, not a second copy.
5. **Given** the details are incomplete, **When** staff try to send a save the date, **Then** they are told what is missing (see User Story 6).

---

### User Story 6 - Couple rehearses and checks readiness before the real send (Priority: P2)

Before the real send the couple can send the save the date to themselves and test households, see the page and the calendar choices for real, and see a plain readiness list of what is not yet set.

**Why this priority**: a message to every relative cannot be unsent. The couple said they want to "make sure it's ready". It is P2 because the send itself works without it.

**Independent Test**: with one deliberate gap (no email template), confirm the readiness list names it and the send is blocked or warned; then fix it, send a test to a staff-chosen household, and confirm only that household is sent to.

**Acceptance Scenarios**:

1. **Given** a campaign, **When** staff choose "send a test", **Then** it goes only to households they choose (their own test household or households), by the channels chosen, through the same path and wording as the real send, and is marked as a test in the delivery view so it is not counted as the real save the date.
2. **Given** a test send, **When** it completes, **Then** the real campaign's "not yet sent" audience is unaffected: the test households can still be included in the real send.
3. **Given** staff open the readiness list, **When** it is shown, **Then** it reports, each as ready or not ready with the reason: the save the date details are complete; the wedding date is set; the save the date email template is registered; the save the date text is registered and within its length rule; the site's public address is set; the RSVP is closed until invitations go out, or open on purpose; the email sending domain is verified; texting is configured and switched on (or off by choice); how many households are reachable by email, by text, by both and by neither.
4. **Given** something is not ready, **When** staff try the real send, **Then** a hard gap (no email template, no wedding date, no site address) blocks it with the reason, and a soft gap (texting off, send time outside the window) warns and lets them proceed.

---

### User Story 7 - Couple follows up with households who have not opened it (Priority: P3)

After the send, the couple can see which households have opened their link and send a gentle follow-up to those who have not, on top of the delivery tracking that already shows bounces and failed texts.

**Why this priority**: it is useful for the guests most likely to have missed the message, but the first outreach works without it.

**Independent Test**: send to four households, open two links, and confirm the list shows two opened and two not, and that a follow-up audience of "not opened" contains exactly the other two.

**Acceptance Scenarios**:

1. **Given** a household whose personal link has been opened or which has signed in by any route, **When** staff view the household list, **Then** it shows that it has opened the site, and when for the first time, without recording what the guest did there.
2. **Given** the audience choices for a campaign, **When** staff choose "has not opened the site", **Then** only those households are included, and it combines with the existing filters.
3. **Given** a mail scanner or link preview that opens a link, **When** it does so, **Then** the household is not reported as having opened the site on that evidence alone where the system can tell (the guest's own device must have loaded the save the date page). Where it cannot tell, the household count is described as "opened or previewed".
4. **Given** the record, **When** staff delete or sign out a household, **Then** the record follows the existing rules for household data.

---

### Edge Cases

- **The same personal link serves the save the date and, later, the invitation.** The destination is decided by the message the link came in, not stored on the household, so a guest who reopens an old save the date email after invitations are out still lands on the save the date, and the invitation lands on the RSVP.
- **A guest's text has a pre-consented number that is a landline.** The text counts as a failed delivery, as the text-message spec already says; the marking is unaffected.
- **A guest replied STOP before the save the date.** The provider refuses further texts to them whatever the site records; the failed text is flagged for follow-up, as today.
- **A number marked consented belongs to someone who never agreed.** The couple's mark is the couple's assertion; the record shows it was marked by staff, by whom and when, so it can be reviewed, and clearing it stops texts.
- **Batch edit includes households with no phone numbers, with numbers already opted in, with numbers that declined, and with numbers belonging to guests who replied STOP.** Each case is counted in the summary; declined numbers are skipped unless staff explicitly choose to override.
- **Two calendar entries after the invitation.** Calendar links for Google and Outlook create a new entry each time and cannot replace an earlier one, so a guest who added the save the date and later adds the invitation event may have two. The standard file replaces an earlier entry in programs that honour its identity. The page tells guests they can remove the earlier one; the wording is the designer's.
- **A guest's email app opens the link in its own built-in browser.** Their sign-in then lives in that browser, not their usual one. The existing ability to open the link again on any device, or type an address to be sent a new link, covers it; the guest interface documentation says so.
- **The email or text link is opened on a work computer, on a shared device, or by someone forwarded the message.** Whoever opens it is signed in as the household, as the invite links spec accepts; the couple can reissue the link and sign the household out everywhere.
- **The wedding date moves after the save the date went out.** The details, page and calendar file follow the wedding event; guests who already added the entry keep the old one, and the couple send an update message. The calendar file's stable identity lets programs that honour it replace the old entry.
- **A guest is on the list twice** (two households sharing a number): numbers belong to at most one household, as today; the second is refused.
- **Texting is switched on after the campaign was scheduled** or switched off before it ran: handled by the existing rules (texts skipped and listed, never silently dropped, nothing sent while off).
- **The send is a very large text run.** The provider's registration limits one message a second; the existing pacing and resume-across-runs behavior applies. The preview shows how long the text part of the run will take.
- **A text longer than one segment.** The save the date text carries a greeting and disclosures plus a long personal link and may take two segments; this is accepted for this one text, and the preview shows the segment count. It does not use a public link shortener (see Assumptions).

## Requirements _(mandatory)_

### Functional Requirements

**Landing and the save the date content**

- **FR-001**: A personal link carried in a save the date email or text MUST sign the guest in and send them to the save the date page; a personal link carried in an invitation, reminder or update MUST keep sending them where it does today. The destination MUST be decided by the message the link arrived in, MUST NOT be stored on the household, MUST NOT reveal anything about the guest in the link beyond what a personal link already contains, and MUST work for emailed and texted links alike. A destination the link names MUST be honored only from a fixed list of known paths.
- **FR-002**: The system MUST provide a guest-facing interface that returns the save the date details (the wedding date, the place line, the note line, the couple's names) and the calendar choices to a signed-in guest, and refuses everyone else. It MUST return nothing about any household other than the caller's, and nothing personal at all in the details.
- **FR-003**: The save the date details MUST be held in one place, editable by the couple and the planner in the admin console. The wedding date MUST come from the wedding event already chosen in the settings, not be entered twice. The couple's names MUST come from the existing settings. Changes MUST be recorded in the change history (field names only). Every surface (page, email, text, calendar entry) MUST use the same stored details.
- **FR-004**: When a signed-in guest's household has a phone number not yet asked about and texting is available, the consent step MUST NOT stand in front of the save the date: the save the date is shown first and the consent step offered after it. The consent step's other rules stay.
- **FR-005**: The RSVP being closed MUST be honored for guests who arrive from a save the date: nothing invites them to respond, and the existing refusal applies if they try.
- **FR-006**: This feature MUST NOT build the save the date page or any other guest-facing screen. It MUST document the guest interface, the landing behavior and the calendar choices for the designer alongside the existing guest interface documentation, and the placeholder homepage MUST keep working unchanged until the designer's page exists.

**Calendar**

- **FR-007**: The system MUST produce, from the save the date details, an all-day calendar entry for the wedding date, in a standard calendar file format that Apple Calendar, Outlook desktop and other calendar programs open, plus links that open a prefilled new entry in Google Calendar and in Outlook on the web. The entry MUST cover exactly the one day, in every time zone.
- **FR-008**: The calendar entry MUST contain only the title, date, place line, a short note and the site's public address. It MUST NOT contain a personal link, a sign-in token, a household name or any guest data, because calendar entries are shared and forwarded.
- **FR-009**: The calendar file MUST carry a stable identity and a revision number that increases when the details change, so calendar programs that honour it replace an earlier entry instead of duplicating it. The calendar choices MUST be withheld, with a plain reason, when the date is not set.
- **FR-010**: The calendar file and links MUST be available only to a signed-in guest (and staff), consistent with FR-002, and MUST be served so that a browser or phone opens them as a calendar entry.

**Pre-consented numbers**

- **FR-011**: The couple and the planner MUST be able to mark a phone number as consented, individually on a household's page and in a batch from the household list. The mark MUST record that it was made by staff, which staff member, when, and an optional short note on where the consent came from, and MUST be shown beside the number everywhere the consent state is shown. No one else, and no unsigned-in visitor, MUST be able to make it.
- **FR-012**: The system MUST provide a batch edit in the household list: choose households (selected one by one, or every household matching the current filter), choose an action, review a summary of what will change, confirm, and see a result summary. The first and required action is "mark phone numbers as consented"; "clear consent mark" MUST also exist. A batch MUST apply all or nothing for the households it names, and MUST say how many numbers changed, how many were already as wanted, how many households had no number, and how many numbers were skipped because they declined or had a delivery refusal.
- **FR-013**: A number that declined at the site's consent step MUST NOT be marked by a batch unless staff explicitly override for it, and an individual mark on a declined number MUST ask for confirmation. The record MUST keep that it declined earlier, in the change history.
- **FR-014**: The guest-list import MUST accept a consent value beside each phone number (yes, no or blank; unrecognised values reported by row and column) and MUST record a yes as consented "by import". It MUST NOT change an already-recorded answer except from not yet asked, unless staff choose to override, and MUST report each such case.
- **FR-015**: Consent belongs to the number. Changing a number's value MUST clear its mark, with a warning first; removing the number MUST remove its record. A guest's own answers on the site (the consent step and the sign-in prompt) MUST keep working as the text-message spec describes, and MUST record that the guest gave it.
- **FR-016**: For a number marked as consented by any route, the consent step MUST NOT ask again. The campaign audience MUST treat it as opted in. No text of any kind MUST be sent to a number that is neither marked nor ticked by its guest. (This replaces the text-message spec's rule that only the guest's ticked box counts; see "What this changes".)
- **FR-017**: The consent record MUST show how consent was recorded (guest's own tick on the site, marked by staff, or imported), by whom where staff were involved, and when, to staff only. Guests MUST NOT see another household's record. The record MUST be kept when texts are switched off, and no text MUST be sent while texting is not available.
- **FR-018**: The first text sent to a number whose consent was recorded by staff or by import MUST identify the sender in the couple's words, carry the link, and carry the disclosures the carriers require (that message and data rates may apply, how to get help, how to stop). No confirmation text MUST be sent when the mark is made.

**Sending**

- **FR-019**: The save the date MUST be sendable by email, by text or by both in one campaign, at once or scheduled, to every household in the audience, with one message per contact, under the existing rules for audiences, previews, retries, pacing, per-contact delivery tracking and "reminders opted out" (a save the date is essential, so it is sent regardless).
- **FR-020**: The system MUST provide a registered slot for the save the date email, with a defined set of inputs (the household's display name, the personal link, the save the date details, the site's address) and a test fixture covering it, and MUST refuse to send the save the date by email while the slot is empty. This feature MUST NOT write real email wording or design; the couple or the designer supply it.
- **FR-021**: The save the date text MUST read as from the couple, in their description: that it is Chris and Hannah and it is time to save the date, followed by the link and the required disclosures. It MAY take up to two text segments; the preview MUST show the segment count. It MUST NOT use a public link shortener. It MUST stay consistent with the sample texts registered with the carriers.
- **FR-022**: Before a campaign that includes text is sent or scheduled outside 11 a.m. to 9 p.m. Eastern time, the console MUST warn that guests elsewhere in the continental United States could receive it before 8 a.m. or after 9 p.m. their local time. The warning MUST NOT block the send.
- **FR-023**: The preview MUST additionally show how many households are reachable by neither channel, how many numbers are pre-consented, the text segment total, and the estimated time to send the text part at the provider's rate.

**Rehearsal and readiness**

- **FR-024**: Staff MUST be able to send any campaign as a test to chosen households only, through the same path and wording as the real send, marked as a test in the delivery view. A test MUST NOT count as the real send for the "not yet sent" audience filter.
- **FR-025**: The console MUST show a readiness list for the save the date (see User Story 6, scenario 3), computed from live settings, naming each gap in plain words. A hard gap (no email template when email is chosen, no wedding date, no site address) MUST block the real send with its reason; a soft gap (texting off, send time outside the window, households reachable by neither channel) MUST warn only.

**Follow-up**

- **FR-026**: The system MUST record, per household, when its site was first opened by a signed-in guest's device, without recording what the guest did. Staff MUST see it in the household list and be able to use "has not opened the site" as a campaign audience filter, combined with the existing filters. Where a mail scanner or link preview could have opened a link on its own, the record MUST not count that alone, or the count MUST be described as "opened or previewed".

**Privacy, documentation and quality**

- **FR-027**: Phone numbers, email addresses, personal links and consent records are personal data: they MUST NOT appear in logs, error messages shown to guests, or the change history (field names only), and fixtures MUST use fake data that cannot reach a real person.
- **FR-028**: The guest interface document, the admin interface document, the manual setup document, the architecture document, the text-message and invite links decision records, `CLAUDE.md`, and the constitution's statements about scope and consent MUST be updated in the same change that alters what they describe, including the reversal listed below and the new batch edit. The manual setup document MUST say that the carrier registration's description of how people opt in has to cover consent collected outside the site.
- **FR-029**: The public privacy and terms pages are locked (the couple's instruction, 2026-11-11): this feature MUST NOT change their wording, structure, links or the facts file they read, and MUST NOT add content to them. Nothing in this feature may depend on changing them. Their existing wording about how guests opt in is recorded as a known conflict with staff-marked consent (see "Known conflict with the locked legal pages").
- **FR-030**: Admin console additions (details form, batch edit, readiness list, test send, the opened column) MUST stay plain, in the existing admin stylesheet, and MUST NOT add a design system or component library.

### What this changes in earlier decisions

1. **The text-message spec's rule that only a guest's ticked box can mark a number as opted in** (its FR-007, and the "no import, edit, campaign or staff action may mark a number" sentence) is replaced: the couple and the planner may mark numbers as consented, one at a time, in batches and by import, with the record showing who and how (FR-011 to FR-016). The database currently enforces the old rule, so the change needs a database migration that widens it for the couple and the planner only; the planning step settles how. A new decision record states the reversal and why.
2. **The text-message spec's "consent step before anything else"** (its FR-008) is narrowed: after a save the date link, the save the date comes first (FR-004).
3. **The text-message spec's one-segment rule** for texts is relaxed for the save the date text only (FR-021).
4. **The invite links spec's single landing path** is extended so a link can land by the message it arrived in (FR-001), without changing any other part of the personal link.
5. **The privacy and terms pages are not changed** (FR-029), even though they currently say a number is texted "only after you opt in by ticking a box on this site" and that "you opt in by ticking an unticked box". See the next section.
6. **The repository's rule against writing email content** stays in force for the save the date email (FR-020); the couple's earlier permission covers the sign-in, invitation and reminder emails only.

### Known conflict with the locked legal pages

Found on 2026-11-11 by reading `src/components/site/PrivacyPolicy.tsx` and `TermsAndConditions.tsx`. The privacy page says "We text a mobile number only after you opt in by ticking a box on this site", and the terms page says "You opt in by ticking an unticked box, either [at first sign-in or on the sign-in prompt]". Texting a number the couple or planner marked as consented, before its guest ticks anything on the site, is not what those pages say. The couple have said the pages are locked, so this feature leaves them alone and does not hide the gap: it is recorded here, in the decision record the planning step writes, and in the manual setup document, so the couple decide knowingly. Ways to close it, none of which is assumed here:

- Keep the pages as they are, and mark as consented only guests who really did opt in through a form that matches the pages' description (a ticked, unticked-by-default box on a page that links to them).
- Unlock the pages later and add one sentence describing consent given before the site existed.
- Do not pre-mark anyone; guests tick the box on first sign-in, and the first text goes only to those who already have. This returns to the text-message spec's rule.

Carrier reviewers read these same pages, so the registration's opt-in description and the pages should agree; the couple should check that before the first text goes out.

### Key Entities

- **Save the date details (new)**: the wedding date (from the wedding event), the place line, the note line; one record; edited by staff; the one source for the page, email, text and calendar entry.
- **Phone contact consent record (changed)**: gains who recorded it and an optional note; its "how recorded" now includes marked by staff and imported, in addition to the guest's own tick.
- **Batch edit (new)**: a one-off action on a chosen set of households, with a summary before and after; not stored beyond the change history.
- **Message destination (new)**: the page a personal link in a given message sends the guest to, chosen from a fixed list, carried with the message, not with the household.
- **Test send marker (new)**: marks messages sent as a test so they do not count as the real send.
- **First opened (new)**: per household, when a signed-in device first loaded the site.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A guest who taps the link in the save the date email or text reaches the save the date page in one tap, signed in, with no code, password or sign-up, in under 10 seconds on a normal mobile connection.
- **SC-002**: In a rehearsal with at least 3 test households, 100% of save the date links, from email and text, land on the save the date page and 100% of invitation links land on the RSVP.
- **SC-003**: The calendar file produces one all-day entry on the correct date in Apple Calendar, Google Calendar and Outlook in each of the three, in at least two different time zones, in 100% of trials; Google Calendar and Outlook web links open the same entry.
- **SC-004**: 0 calendar files or links contain a personal link, sign-in token, household name or other guest data.
- **SC-005**: The couple can mark 100 households' numbers as consented in one batch in under 2 minutes, with a summary that accounts for 100% of the numbers touched.
- **SC-006**: Across a send, 0 texts go to numbers that are neither marked by staff or import nor ticked by their guest, and 0 contacts receive a second copy.
- **SC-007**: Before the real send, the readiness list names 100% of the deliberately planted gaps in a rehearsal (no email template, no wedding date, no site address, texting off).
- **SC-008**: A save the date sent to a test household never changes who the real send's "not yet sent" audience includes.
- **SC-009**: After the send, the couple can list every household that has not opened the site within 1 minute, and send a follow-up to exactly that group.

## Assumptions

- **The save the date page is the designer's** (as the couple described: "by that point we'll have the visual design ready"). Until it exists, opened links land on the placeholder homepage and the couple's rehearsal checks the destination and the content endpoint, not a finished page. If the couple want a plain stand-in page to rehearse the whole flow, that needs a new narrow scope exception in `CLAUDE.md`, as the earlier exceptions were granted; this spec does not assume one.
- **The save the date email wording and design are supplied by the couple or the designer.** If the couple prefer a plain first draft, they can extend the earlier permission, and the registration slot is ready for it.
- **The privacy and terms pages stay exactly as they are** (FR-029), and they describe only the on-site tick as the way to opt in; see "Known conflict with the locked legal pages".
- **How pre-consent was collected matters to the text-message provider, not only to the site.** Twilio's registration asks how people opt in and accepts several routes (a consent form on a website or app, a verbal opt-in with a detailed script, a signed paper document, or a text keyword), and says consent applies per campaign ([Twilio, A2P 10DLC quickstart](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart); [Twilio, campaign onboarding guide](https://support.twilio.com/hc/en-us/articles/11847054539547-A2P-10DLC-Campaign-Onboarding-Guide)). Searching on 2026-11-11 found nothing from Twilio on what evidence it wants for consent collected elsewhere, so the registration's opt-in description should be written to match how the couple really collected it, and the couple should keep their own copy of that evidence. The note field on the consent mark (FR-011) exists to point at that evidence. This is not legal advice, and the couple should confirm with Twilio if unsure.
- **Quiet hours are a warning, not a block.** The federal quiet-hours rule, 8 a.m. to 9 p.m. recipient local time, is in the FCC's telemarketing rule; whether it applies to texts sent with prior consent is undecided at the FCC, and some states set stricter hours ([National Law Review](https://natlawreview.com/article/clocked-fcc-seeks-clarity-call-time-rules); [Referrizer summary of state rules](https://support.referrizer.com/en/category/text-campaigns/article/tcpa-quiet-hours-and-state-specific-rules-for-text-campaigns)). The text-message spec decided the system would not enforce quiet hours; this spec adds a warning only. 11 a.m. to 9 p.m. Eastern keeps every continental time zone inside 8 a.m. to 9 p.m.
- **Calendar link formats are community-documented, not official.** All-day entries use date-only values with an exclusive end date, one day after the event, in Google Calendar links and in the standard calendar file ([Interaction Design Foundation's add-to-calendar notes](https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html); [RFC 5545](https://rfc-editor.org/rfc/rfc5545)). Outlook web's prefilled-entry link works at `outlook.live.com` with `allday=true`, and its address has changed before ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/860833/outlook-changing-special-characters-to-html-encode); [Microsoft tech community report](https://techcommunity.microsoft.com/discussions/outlookgeneral/httpsoutlook-office-comcalendar0deeplinkcompose---fails-to-load-and-redirect/3816442)). Whether Apple Calendar and Outlook replace an earlier entry on re-import by its identity was not found documented, so the planning step tests it in real programs. Success criterion SC-003 is the check.
- **No public link shortener in texts.** Twilio says links shortened with shared public shorteners should not be sent, because US carriers discourage them ([Twilio support](https://support.twilio.com/hc/en-us/articles/1260804572090)). The personal link is about 66 characters plus the site's address, so the save the date text exceeds one segment once the greeting and disclosures are added; two segments is accepted for it. A branded short address for the site is a possible later improvement and is out of scope here.
- **The RSVP is closed (the existing on/off setting) until invitations go out.** Today it defaults to open, so the readiness list (FR-025) makes the couple choose on purpose.
- **Saving the date is an essential message type** (already so in the system), so it is sent to households that opted out of reminders.
- **A household sees the save the date whether or not it is also invited to the RSVP events**, because the card is the same for everyone who receives one.
- **Whether a mail scanner opened a link cannot always be known** (FR-026), so the "has not opened the site" list is a guide for follow-up, not proof anyone read the message.
- **The batch edit is built as a general admin feature**, with the consent actions first, so later batch actions can use it. Only the consent actions are in scope here.
- The earlier rules stay: guests never create accounts themselves, sign-in never reveals who is on the guest list, staff sign in by email link, and every other guest-facing screen is the designer's.
