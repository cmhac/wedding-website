# Feature Specification: Personal invite links and shared household sign-in

**Feature Branch**: `003-personal-invite-links` (work happens on the session branch; the spec directory name does not dictate it)

**Created**: 2026-10-26

**Status**: Draft, email only (rewritten 2026-11-05: text messages are deferred to a later feature; see "Deferred: text messages")

**Input**: User description (2026-10-26): "Add SMS (text message) as a way for guests to sign in and receive messages, alongside email. Households may have a phone number instead of or in addition to an email; guests who have a phone number can sign in with a one-time code sent by text, and the couple can send campaigns by text as well as email. Out of scope: email content, guest-facing screens. Consider consent and opt-out, carrier registration rules, delivery tracking, uniqueness of phone numbers across households, paper-only households, the admin console v0 screens that need a phone field, and the existing rule that sign-in never reveals who is on the guest list."

**Update (2026-10-29)**, in the couple's words: "For sign in I want to support two paths, email and sms. Same magic link for both, only one is required. For non-us users it'll be email only, for everyone else it'll be sms and email probably or just one or the other in some cases. This means also setting up proper email hooks like we discussed rather than supabase smtp." Then: "What I want is for us to import the guests and send emails and texts telling them to RSVP. When they click the link it counts as account creation and they're allowed to access the app from those devices." Then: "Let people stay signed on indefinitely once they're signed in. We'll want couples and families to get one account shared by multiple people too if that is possible to send this to multiple phones and emails." Then: "Links should stop working on day of wedding. But also need to be able to have an RSVP deadline that keeps the link alive but says that the deadline is passed. No Canadian numbers. I vouch for their consent. Staff sign in via email still. You can write the email and texts, I'll polish them later." And: "We will also need a way to allow the staff to manually mark people as rsvpd without having an email or phone number, like for elderly relatives." And, on consent: "They're my wedding guests and this is a small hobbyist app. We don't need to track consent like this."

**Update (2026-11-05)**: "I want to keep everything as-is, but for now keep it email-only and set aside the sms component with plans to implement it in a future spec. I don't want it blocking implementation."

## Clarifications

### Session 2026-10-29

- Q: How do guests first get in? → A: The couple import the guest list, then send each household an invitation. The invitation carries a personal link for that household; opening it signs the guest in, with no separate sign-up. This is how wedding sites such as Joy work.
- Q: How long does a personal invite link work? → A: From when it is issued until the wedding day, unless the couple reissue it. It stops working on the wedding day. (Supabase's own sign-in links last an hour by default, so the personal link is the site's own and only uses Supabase behind the scenes.)
- Q: What happens after the RSVP deadline? → A: The personal link keeps working: guests can still sign in and see their answers, and are told the deadline has passed and to contact the couple to change anything. This is the existing deadline rule; staff can still change answers.
- Q: How long do guests stay signed in? → A: Indefinitely on each device they have signed in on, until they sign out or the couple revoke access.
- Q: One account per person or per household? → A: One shared account per household. A household can have several email addresses (for example both partners, or parents and an adult child), and every one of them gets the invitation and can sign in to the same household.
- Q: How do staff sign in? → A: By email link, as today. No personal links for staff.
- Q: Who writes the sign-in, invitation and reminder emails? → A: This feature writes first drafts of the wording and plain templates; the couple polish the wording later. Making the emails look like the website follows the designer's design once it exists.
- Q: Can signed-in guests add, change or remove their own household's email addresses? → A: No, staff only. Guests can see their household's contacts but must ask the couple to change them.
- Q: After the wedding day, can guests still sign in by typing their email? → A: Yes. Only personal links stop on the wedding day; guests can still request a sign-in link, and anyone already signed in stays signed in.
- Q: Can staff record answers for guests with no email? → A: Yes, as they can today: staff record RSVPs and meal choices on a household's behalf, marked as recorded by staff.
- Q: How are sign-in and invitation emails built and sent? → A: From templates registered in this repository and sent by this repository's code, so they look like the website and the invitations. Sign-in emails move to the Send Email hook (the auth-emails decision record, `docs/decisions/0004-auth-emails-via-resend.md`); the temporary custom SMTP setup in production is retired.

### Session 2026-11-05

- Q: Are text messages part of this feature? → A: No. This feature is email only. Text messages are deferred to a later feature, keeping every decision already made about them (see "Deferred: text messages"), so they do not block this one.
- Q: Who can reissue a household's personal link and sign a household out everywhere? → A: The couple and the planner.
- Q: How does a guest sign in on a second device? → A: Either open the invitation's personal link again on that device (it is not used up and works on any number of devices until the wedding day), or type any of the household's email addresses on the sign-in page to get a short-lived link. Each device stays signed in on its own; signing in on one does not sign out another.
- Q: Is this a custom sign-in system? → A: No. Supabase Auth still owns accounts, sign-in links, sessions and access rules; Resend only delivers the emails. The site adds a thin layer that works out which household a personal link or typed address belongs to, then hands off to Supabase.

## Background

Today a household is reached by one contact email, or not at all (a "paper only" household that gets a printed invitation). One person per household, the responder, signs in by typing that email and receiving a one-time link that lasts about an hour. Production currently sends Supabase's own sign-in email through Resend over custom SMTP, as a stopgap.

This feature changes three things:

1. **Personal invite links.** Each household gets its own long-lived link. Invitations and reminders carry it, so opening the invitation is how a guest first signs in.
2. **Shared household access.** A household can have several email addresses. All of them get the invitation and reach the same household and its one RSVP.
3. **Sign-in emails from the repository.** Sign-in, invitation and reminder emails are built from templates kept in this repository, replacing Supabase's own wording and the custom SMTP stopgap.

Once signed in, a guest stays signed in on that device indefinitely.

Plain-language terms used below:

- **Household**: the unit that is invited and answers the RSVP together (unchanged).
- **Contact**: one email address belonging to a household. A household has zero or more. (The later text-message feature adds phone numbers as a second kind of contact.)
- **Personal invite link**: a long-lived web link unique to one household. Anyone opening it is signed in as that household.
- **Sign-in link**: a short-lived link a guest asks for by typing one of the household's email addresses, for a new device or a lost invitation.
- **Campaign**: one send of a message type (an invitation, a reminder, an update) to a chosen group of households.
- **Paper only**: a household with no contacts at all.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest signs in by opening their invitation (Priority: P1)

The couple import the guest list and send invitations. A guest opens the invitation email, taps their household's personal link, and is signed in to their household's RSVP straight away. They never create an account or choose a password. They stay signed in on that device.

**Why this priority**: it is how nearly every guest will first reach the site, and it matches how guests expect wedding sites to work.

**Independent Test**: import a household with one email address, send it an invitation campaign, open the link from the email on two devices, and reach that household's RSVP on both, and nothing else.

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

A household can list several email addresses: both partners in a couple, or parents and an adult child. Every address receives the invitation, and every one of them can sign in to the same household, see the same RSVP and change it.

**Why this priority**: couples and families answer together, and sending to only one member means the invitation is often missed.

**Independent Test**: give a household three email addresses, send an invitation, and confirm three emails go out (one per address), and that signing in from any of them reaches the same household and the same RSVP.

**Acceptance Scenarios**:

1. **Given** a household with several email addresses, **When** an invitation campaign is sent, **Then** each address receives exactly one email, and all carry the same personal link.
2. **Given** two members signed in on different devices, **When** one saves a change to the RSVP, **Then** the other sees it on their next page load.
3. **Given** two members save the RSVP at about the same time, **When** both saves arrive, **Then** neither leaves the RSVP in a broken state, and the change history records each save.
4. **Given** the couple remove one address from a household, **When** that person later types the removed address to ask for a sign-in link, **Then** nothing is sent and they get the neutral answer; other addresses are unaffected.

---

### User Story 3 - Guest asks for a sign-in link on a new device (Priority: P1)

A guest on a new phone or laptop, or who has lost the invitation, types any one of their household's email addresses on the sign-in page and receives a short-lived sign-in link by email. Opening it signs them in, with the same access as the personal link.

**Why this priority**: personal links get lost or deleted, and people change devices; without this, a guest can be locked out.

**Independent Test**: with a household that has two addresses, ask for a link by each, open each, and reach the same household. Ask for a link for an unknown address and confirm the answer is identical.

**Acceptance Scenarios**:

1. **Given** a known email address, **When** a guest asks for a sign-in link for it, **Then** a link is sent to that address only, and opening it signs them in to the household.
2. **Given** a sign-in link that has expired or been used, **When** it is opened, **Then** the guest lands on the plain failure page and can ask for another.
3. **Given** an email address that is on no household, **When** someone asks for a link, **Then** they get exactly the same on-screen answer, taking the same time, as for a known address, and nothing is sent and no account is created.

---

### User Story 4 - Couple manages households' email addresses and links (Priority: P1)

The couple and the planner add, change and remove a household's email addresses, in the household form and in the guest-list spreadsheet import. They see at a glance how many addresses each household has, and which are paper only. They can also reissue a household's personal link, and sign a household out everywhere.

**Why this priority**: nothing else works until addresses are on file, and wrong data sends invitations to the wrong people.

**Independent Test**: create a household with two email addresses, edit and remove one, import a spreadsheet with good, invalid and repeated addresses, and check per-row errors and the counts shown. Reissue a household's link and confirm the old one stops working.

**Acceptance Scenarios**:

1. **Given** an email address already on another household, **When** staff save, **Then** it is refused with a plain message that it is already in use.
2. **Given** an import file with several email columns per household, **When** it is imported, **Then** valid addresses are saved, and invalid or repeated ones are reported by row and column, with the rest of that household skipped as for other bad rows.
3. **Given** staff remove a household's last email address, **When** they save, **Then** they are warned it becomes paper only and nobody in it can sign in.
4. **Given** staff reissue a household's personal link, **When** the old link is opened, **Then** it no longer works, and the new link works; staff are reminded to send the new link.
5. **Given** staff choose "sign out everywhere" for a household, **When** any member next uses the site, **Then** they are signed out and must sign in again by a link.

---

### User Story 5 - Couple sends invitations and reminders that carry the personal link (Priority: P2)

When the couple send an invitation or reminder campaign, it goes to every email address of each household in the audience, and each email includes the household's personal link. The audience filters and preview work as today, now counting addresses as well as households.

**Why this priority**: it is how guests get their personal link, but it depends on addresses (Story 4) being in place.

**Independent Test**: with households that have one address, several addresses, and none (paper only), send a campaign and confirm each address got exactly one email, or the household is listed as skipped with a reason.

**Acceptance Scenarios**:

1. **Given** a campaign, **When** it is sent, **Then** every email address of every household in the audience receives exactly one email containing that household's personal link.
2. **Given** the preview, **When** staff open it, **Then** each household shows how many emails it will receive, and each skipped household shows why (paper only, reminders opted out for a non-essential type, or already responded where the filter applies).
3. **Given** a campaign that has already been sent, **When** it is retried or run again, **Then** no address receives a second copy.
4. **Given** a message type with no registered template, **When** staff try to send it, **Then** the send is refused with a plain message and nothing goes out (as today).
5. **Given** a household that opted out of reminders, **When** a reminder goes out, **Then** it is excluded, but an essential logistics update still goes to it.

---

### User Story 6 - Sign-in emails come from the repository's own templates (Priority: P2)

Every sign-in email is built from a template registered in this repository and sent by this repository's code, so sign-in emails look like the website and the invitations and are versioned and tested with the code. Supabase's own email wording and the custom SMTP stopgap stop being used in production.

**Why this priority**: the couple require it, and it removes the dependence on Supabase's hourly email cap. It is P2 only because the stopgap already delivers sign-in emails while the templates are being made.

**Independent Test**: with a fixture `magic_link` template registered, ask for a sign-in link, and confirm the email is rendered from the registered template and that Supabase's own email is not sent.

**Acceptance Scenarios**:

1. **Given** a registered `magic_link` email template, **When** anyone (guest or staff) asks for a sign-in link, **Then** it is rendered from that template and sent through Resend from the verified sending domain.
2. **Given** a missing or failing template, **When** a link is requested, **Then** nothing is sent, the guest still sees the neutral answer, and the failure is logged without any address.
3. **Given** the switch-over to the hook, **When** it happens, **Then** there is no period in which nobody can receive a sign-in email.

---

### User Story 7 - Couple tracks delivery per address and follows up (Priority: P3)

Each email sent is recorded per address, with its delivery status updated from Resend as today. A bounced or complained email flags that address, and the household, for follow-up.

**Why this priority**: it makes sends accountable now that a household can have several addresses, but the feature is useful without it.

**Independent Test**: send a campaign to a household with two addresses, deliver a bounce for one, and confirm that address and the household are flagged while the other address is not.

**Acceptance Scenarios**:

1. **Given** an email that bounced, **When** the status arrives, **Then** that address and its household are flagged, and the couple see which address failed.
2. **Given** the same status twice, or a later one before an earlier one, **When** they are processed, **Then** the record ends in the correct state (as today).
3. **Given** a flagged address, **When** it is corrected or removed, **Then** the flag clears.

---

### Edge Cases

- A personal link is forwarded to someone outside the household: whoever opens it is signed in as that household (as with Joy's personal links). The couple can reissue the link and sign the household out everywhere.
- A guest signs in on a shared or public computer: they stay signed in until they sign out, so a visible sign-out is part of the guest interface the frontend builds.
- A household's personal link is reissued after invitations went out: the old link stops working, and guests who already signed in stay signed in unless the couple also sign the household out everywhere.
- A guest wants to use a second device: they open the personal link again on it, or ask for a sign-in link by typing any household address; the first device stays signed in.
- A guest has lost access to every email address on their household: staff add a new address for them, or copy the household's personal link from the admin console and send it to them another way.
- Two households in one home share an email address: an address can belong to only one household, so the couple list it once, or give the second household a different address.
- Someone asks for many sign-in links (their own addresses, or ones they do not own): limits per address and overall stop abuse, without revealing which addresses are known.
- A staff member's email is also a household address: not allowed; a person who is both staff and a guest uses different addresses for each (see FR-013).
- A household is deleted: all its addresses, personal link and message records are removed or anonymised under the same rule as today's contact email.
- An elderly relative with no email (paper only) answers by post or by phone call: staff record the RSVP and meal choices on the household's behalf in the admin console, as they can today; it is marked as recorded by staff.
- The wedding day arrives: personal links stop working (see FR-004). Guests already signed in stay signed in.
- A guest asks for a sign-in link on or after the wedding day: short-lived sign-in links still work, so a guest can still reach the site (for example to see the schedule).

## Requirements _(mandatory)_

### Functional Requirements

**Household email addresses**

- **FR-001**: A household MUST be able to have zero or more email addresses. None means paper only; any one address is enough to be reachable and to sign in. The data design MUST allow phone numbers to be added later as a second kind of contact without reworking this feature (see "Deferred: text messages").
- **FR-002**: Every email address MUST belong to at most one household, compared case-insensitively. A repeat MUST be refused with a plain message.
- **FR-003**: Only the couple and the planner MUST be able to add, change and remove a household's email addresses; guests MUST NOT be able to change them, though a signed-in guest MAY see their own household's addresses. The guest-list import MUST accept several email columns per household, with per-row, per-column errors, in both spreadsheet formats it already accepts. Removing the last address MUST warn that the household becomes paper only. Removing an address MUST stop it from being used to ask for a sign-in link immediately.

**Personal invite links and staying signed in**

- **FR-004**: Each household MUST have one personal invite link that signs in whoever opens it as that household. It MUST keep working from when it is issued until the wedding day, unless the couple reissue it, and MUST stop working from the start of the wedding day, in the venue's time zone (California). The wedding day is the date of the wedding event, so moving the event moves the cut-off. Opening the link MUST NOT use it up: it MUST sign in any number of devices, each independently.
- **FR-005**: Passing the RSVP deadline MUST NOT stop a personal link. After the deadline, a signed-in guest MUST still be able to see their household's answers and MUST be told plainly that the deadline has passed and to contact the couple; changes stay refused as the existing deadline rule says, and staff can still change answers.
- **FR-006**: Personal links MUST be long and unguessable, MUST NOT contain any guest name or email, and MUST NOT be stored in a form that would let a database leak reveal working links.
- **FR-007**: Staff (the couple and the planner) MUST be able to reissue a household's personal link (the old one stops working at once) and sign a household out everywhere (every device must sign in again).
- **FR-008**: A guest who has signed in by any route MUST stay signed in on that device indefinitely, until they sign out, staff sign the household out everywhere, or the household is deleted. Guests MUST be able to sign out.
- **FR-009**: Only personal links stop on the wedding day. Requesting a sign-in link by typing an address (FR-012) MUST keep working after the wedding day, and existing sessions MUST NOT be ended by the wedding day.
- **FR-010**: Opening a personal link MUST NOT create a new account: the household's sign-in account is created when it is imported or added, and opening the link signs into it. All of a household's addresses and links MUST lead to the same household account and the same access.
- **FR-011**: A bad, cancelled or expired link MUST lead to one plain failure page that reveals nothing about any household.

**Sign-in links on request**

- **FR-012**: A guest MUST be able to ask for a short-lived sign-in link by typing any one of their household's email addresses. The link MUST go only to the address typed and MUST sign in to the same household as the personal link.
- **FR-013**: Staff sign-in (couple and planner) MUST stay on email links; staff do not get personal invite links. A staff email MUST NOT also be a household address.
- **FR-014**: Asking for a sign-in link MUST never create an account and MUST never reveal whether an address is on the guest list: the answer, status and response time MUST be the same for known and unknown addresses.
- **FR-015**: The system MUST limit sign-in link requests per address and overall, without changing the neutral answer. Limits MUST be settable without code changes.
- **FR-016**: The guest-facing interface for personal links, sign-in requests and sign-out MUST be documented in the repository alongside the existing guest interface. This feature builds no screens.

**Shared household access**

- **FR-017**: Any signed-in member of a household MUST be able to read and change the household's RSVP, with the rights the single responder has today. Concurrent changes MUST NOT corrupt the RSVP, and the change history MUST record each save (field names only, as today).
- **FR-018**: Staff MUST keep the existing ability to record RSVPs and meal choices on a household's behalf, including for paper-only households with no addresses at all, with no email or sign-in involved. Answers recorded by staff MUST stay marked as recorded by staff, naming who, as today, and MUST be visible to any member who later signs in.

**Campaigns**

- **FR-019**: The existing reminder opt-out MUST apply per household: non-essential types are excluded, essential logistics updates are still sent.
- **FR-020**: A campaign MUST be sent to every email address of each household in the audience. All existing audience filters MUST work unchanged; the preview MUST show per household how many emails will go out, and per skipped household why.
- **FR-021**: Invitation and reminder templates MUST be given the household's personal link to include. A send MUST remain idempotent per address: re-running or retrying MUST NOT send any address a second copy.
- **FR-022**: Each email MUST be recorded per address: household, the address used at the time, message type, campaign, timestamp and delivery status (the existing statuses). Delivery notifications MUST update it, tolerating duplicates and out-of-order arrival, as today.
- **FR-023**: A bounced or complained email MUST flag that address and its household for follow-up, counted with existing delivery problems, and the flag MUST clear when the address is corrected or removed.

**Sign-in emails from the repository**

- **FR-024**: Every sign-in email MUST be rendered from the `magic_link` template registered in the repository and sent through Resend by the site's code: guest sign-in links by the guest sign-in route, staff sign-in links through the Send Email hook. Supabase's own email wording MUST NOT be used. If the template is missing or fails, nothing MUST be sent, the guest MUST still see the neutral answer, and the failure MUST be logged without any address.
- **FR-025**: This feature MUST write first drafts of the wording and plain templates for the sign-in email (`magic_link`) and the invitation and reminder emails, registered in the repository and covered by tests. The couple polish the wording later. Visual design that matches the website follows the designer's design when it exists; until then the templates are plain.
- **FR-026**: The custom SMTP stopgap MUST stay on until the hook is on and a test sign-in email through the hook has been delivered; then it MUST be removed and the manual setup document updated.

**Admin console v0**

- **FR-027**: The temporary admin console MUST let staff view and edit a household's email addresses; show address counts and paper-only state in the household list and detail; reissue a household's personal link and copy it; sign a household out everywhere; accept several email columns in the import; and show per-address delivery in the preview, delivery status, overview and reports. It MUST stay plain and use the existing single stylesheet.

**Privacy, setup and documentation**

- **FR-028**: Email addresses and personal links are personal data. They MUST NOT appear in logs, error messages shown to guests, or the change history (field names only), and fixtures and seed data MUST use fake addresses that cannot reach a real person. Deleting a household MUST remove or irreversibly anonymise its addresses, personal link and message records.
- **FR-029**: The setup steps that cannot be done in code (the Send Email hook switch-over and the removal of custom SMTP, and any session settings) MUST be added to the manual setup document, with secrets handled like the existing ones.

### Key Entities

- **Household (changed)**: keeps one sign-in account, now shared by all its members. Gains a personal invite link. Its single contact email moves into household contacts.
- **Household contact (new)**: one email address belonging to one household, unique across all households, with a delivery-problem flag. Designed so a phone-number kind can be added later.
- **Personal invite link (new)**: the household's long-lived sign-in link, stored so that a leak does not reveal it, with when it was issued and when it stops working.
- **Message (changed)**: one email to one address in one campaign; gains the address used.
- **Sign-in template**: the registered `magic_link` email template.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A guest who receives an invitation reaches their household's RSVP in one tap from the email, with no sign-up, password or code, in under 30 seconds.
- **SC-002**: A guest who signed in stays signed in on that device for at least the whole period from invitation to wedding without signing in again, unless they or staff sign them out.
- **SC-003**: For a household with several addresses, 100% of them receive the invitation exactly once, and signing in from any of them reaches the same household and RSVP.
- **SC-004**: For known and unknown addresses, the sign-in request answer is identical in content and arrives within 250 milliseconds of one another on average; 0 accounts are created by any request or link.
- **SC-005**: After staff reissue a household's personal link, the old link signs in 0 people.
- **SC-006**: A campaign, including when retried, sends each address exactly one email and no address two.
- **SC-007**: 100% of repeated or invalid addresses in an import of at least 200 rows are reported by row and column, and none is saved.
- **SC-008**: 100% of sign-in emails in production are rendered from templates registered in the repository; 0 use Supabase's own wording.

## Assumptions

- **This feature changes two earlier decisions**, which the plan must record as superseded: the guest-identity decision (`docs/decisions/0003-guest-identity.md`) keeps one sign-in account per household but drops the link to a single contact email, and adds personal links; the household decision (`docs/decisions/0006-household-model.md`, exactly one responder per household) becomes any signed-in member answers for the household.
- Personal invite links are the site's own, not Supabase's: Supabase's sign-in links last an hour by default ([Supabase config reference](https://supabase.com/docs/reference/cli/config-reference)), and third-party write-ups say much longer values are discouraged. Opening a personal link signs into the household's Supabase account behind the scenes, using Supabase's documented admin function that generates a sign-in link without sending it ([generateLink](https://supabase.com/docs/reference/python/auth-admin-generatelink)). Exact mechanics are a planning question.
- Supabase Auth remains the sign-in system: one account per household, its sign-in links (single use, short-lived), sessions, sign-out and the access rules in the database. Resend only delivers emails. The site's own layer stores personal links and the household's list of addresses, decides which household a link or typed address belongs to, and then asks Supabase for a sign-in link for that household's account. Because a Supabase account holds one email address, a guest typing any of the household's addresses is handled by that layer, not by Supabase's own email sign-in. To be confirmed at planning time.
- Staying signed in indefinitely is Supabase's default: sessions renew themselves and end only if a maximum lifetime or inactivity timeout is configured ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)). The plan confirms the production settings leave both off.
- Per-household personal links are how wedding sites such as Joy work; Joy notes that anyone with a guest's link can RSVP as that guest ([Joy help](https://withjoy.com/help/en/articles/8342084-personalized-ecard-links-for-guests)). The couple accept that risk, mitigated by reissue and sign-out everywhere.
- The project constitution says sign-in is "magic-link for everyone". Personal links are still magic links, so that line holds; the plan checks whether a wording clarification is worth making.
- The existing rules otherwise stay: guests never create accounts themselves, and sign-in never reveals who is on the guest list.
- Guest-facing screens stay out of scope; the guest-facing interface is documented here for the designer's frontend. Email content is in scope for this feature only as first drafts (FR-025), by the couple's explicit permission on 2026-10-29, which overrides the repository's general rule against writing email content for these templates.

## Deferred: text messages

Set aside on 2026-11-05 for a later feature, so it does not block this one. These decisions were already made and carry over to that feature:

- **Phone numbers as contacts**: a household can have zero or more United States phone numbers alongside its email addresses; any one contact is enough. Each number belongs to at most one household, compared in one standard form. Only staff add or change them.
- **United States only**: Canadian and other +1 numbers outside the United States are refused; those guests use email.
- **Same link, not a code**: a text carries the same kind of sign-in link as an email (the personal link in invitations; a short-lived link when a guest types their number). There is no typed-code flow, so Supabase's own phone sign-in is not needed; the provider only delivers messages.
- **Campaigns by text**: invitations and reminders can go by email, text or both, to every reachable contact.
- **No consent tracking**: the couple's own guests on a small personal site. The provider's standard STOP, START and HELP handling is relied on (for example [Twilio's](https://support.twilio.com/hc/en-us/articles/223134027-Twilio-Support-for-Opt-out-Keywords-SMS-STOP-Filtering)); a text refused because the number opted out counts as a failed delivery.
- **Provider and registration**: the leading option is Twilio with sole-proprietor carrier registration (for individuals with no business tax number; Twilio lists $4 to register, $15 for the review and $2 a month). Twilio chosen by the couple on 2026-11-10. The "about 15 minutes of forms" estimate here was too low: registration also needs public privacy and terms pages and a described opt-in, as corrected in the text-message spec (`specs/005-sms-support/spec.md`). Alternatives checked and set aside: short codes (Twilio lists $1,000 a month), toll-free numbers (now need privacy-policy and terms pages), email-to-text gateways (shut down or being shut down), and sending through an Android phone (a grey area for automated texts).
- **One on/off switch** for texts, off until the provider is set up.
- **Sign-in texts from the repository**: a registered sign-in text template, with first-draft wording written by that feature.
