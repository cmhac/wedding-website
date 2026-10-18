# Feature Specification: Guest, Invitation, and Communication Data Model

**Feature Branch**: `ccr-ed2f4b54-3hd6vb` (work happens on the session branch; the spec directory name is independent)

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "Data model for the wedding website: a hard-coded-content website frontend (no CMS) plus guest, household/invite, event, RSVP, and invite/reminder (email) management."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Build and maintain the guest list (Priority: P1)

Chris or Hannah (the "couple") record who is invited: each guest, which household (party) they belong to, which events each guest is invited to, and how to reach the household. They can add, edit, and remove guests and households at any time, import an existing list in bulk, and see the whole list at a glance.

**Why this priority**: Everything else (RSVPs, invitations, reminders) depends on an accurate list of who is invited to what. A usable guest list alone already replaces a spreadsheet.

**Independent Test**: With only this story built, the couple can create households and guests, assign event invitations, edit them, and view totals per event, with no RSVP or email features present.

**Acceptance Scenarios**:

1. **Given** an empty guest list, **When** the couple adds a household with three guests and invites two of them to the rehearsal dinner and all three to the ceremony, **Then** the household shows three guests with the correct per-event invitations.
2. **Given** an existing household, **When** the couple changes one guest's event invitations, **Then** only that guest's invitations change and other guests are unaffected.
3. **Given** a bulk import file of households and guests, **When** the couple imports it, **Then** valid rows are created, and invalid rows are reported with the row and reason, without creating partial households.
4. **Given** a household with no email address (for example, a relative who gets a paper invitation), **When** the couple saves it, **Then** it is accepted and clearly marked as not reachable by email.

---

### User Story 2 - Guests RSVP for their household (Priority: P1)

A guest follows their personal link or signs in with the email their invitation was sent to, sees only their own household and the events they are invited to, and responds yes or no for each person and each event. They can record meal choice, dietary needs, and a short note, and can change their answers until the RSVP deadline.

**Why this priority**: Collecting accurate responses is the core purpose of the guest-facing part of the site.

**Independent Test**: With a seeded household, a guest can open their RSVP, answer for every invited person and event, save, return later, and see and change their saved answers.

**Acceptance Scenarios**:

1. **Given** a household invited to two events, **When** a member responds for each person and event, **Then** every answer is saved and shown back on return.
2. **Given** a guest invited only to the ceremony, **When** they view their RSVP, **Then** they see no other events.
3. **Given** the RSVP deadline has passed, **When** a guest tries to change an answer, **Then** the change is refused with a message to contact the couple, while the couple can still edit on their behalf.
4. **Given** two different households, **When** a guest of one tries to view or change the other's RSVP, **Then** access is denied.
5. **Given** a household allowed one plus-one, **When** the guest names the plus-one, **Then** the plus-one is recorded as a guest in that household with their own answers.

---

### User Story 3 - Send invitations and reminders and track delivery (Priority: P2)

The couple compose invitation, reminder, and update emails from a fixed set of templates, choose recipients (everyone, a single household, or a filtered group such as "has not responded" or "invited to the rehearsal dinner"), and send now or schedule. The system records exactly what was sent to whom and when, and whether it was delivered, bounced, or failed, so a reminder never goes to people who already responded unless the couple chooses otherwise, and nobody gets the same message twice by accident.

**Why this priority**: Communication drives response rates, but it only works once the guest list and RSVPs exist.

**Independent Test**: With a seeded guest list, the couple can send a reminder to non-responders only and then see a per-household record of that send and its delivery status.

**Acceptance Scenarios**:

1. **Given** 10 households of which 6 have responded, **When** the couple sends the "RSVP reminder" to non-responders, **Then** exactly 4 households receive it and 4 send records exist.
2. **Given** a message already sent to a household, **When** the same send is triggered again (for example, a retry), **Then** the household is not emailed a second time.
3. **Given** a delivery failure for one address, **When** the status is updated, **Then** the household is flagged for follow-up and the failure is visible to the couple.
4. **Given** a household with no email address, **When** the couple selects "everyone", **Then** that household is skipped and listed as needing a paper invitation.
5. **Given** a guest who unsubscribed from reminders, **When** the couple sends a reminder, **Then** that guest is excluded, but essential logistics updates can still be sent.

---

### User Story 4 - Couple's dashboard and exports (Priority: P2)

The couple see headcounts per event (invited, attending, declined, no response), meal and dietary totals, households needing follow-up, and can export the list and responses for caterers and venues.

**Why this priority**: Turns the collected data into decisions (catering counts, seating) but is not required to collect it.

**Independent Test**: With seeded RSVPs, totals match a manual count and an export contains one row per guest per event.

**Acceptance Scenarios**:

1. **Given** seeded responses, **When** the couple opens the dashboard, **Then** per-event counts match the underlying answers exactly.
2. **Given** a guest changes an answer, **When** the couple refreshes, **Then** counts reflect it immediately.

---

### User Story 5 - Public website content stays in the code (Priority: P3)

Visitors can read the public pages (details, schedule, travel, registry, FAQ) without signing in. All that text is written directly into the site, not stored or edited as data. Guest-specific pages (RSVP, personalized greeting) draw only on the guest data in this model.

**Why this priority**: It bounds scope: the data model does not need to store page content, and the public site works for anyone.

**Independent Test**: Public pages render with the database empty or unavailable; the RSVP page works only for recognized guests.

**Acceptance Scenarios**:

1. **Given** a visitor who is not signed in, **When** they open a public page, **Then** it displays with no guest data required.
2. **Given** a signed-in guest, **When** they open the RSVP page, **Then** they see a greeting using their household's display name.

---

### Edge Cases

- A household member lacks their own email; the household has one shared contact email.
- Two households share one email address (for example, a parent and an adult child): sign-in and sends must not expose one household to the other.
- A guest is added to a household after invitations went out: they appear as invited and can be sent a catch-up message without re-sending to others.
- An event invitation is removed after a guest already responded: the response is kept for history but excluded from counts, and the guest no longer sees the event.
- A guest is deleted: their responses and send history are removed or anonymized consistently, and counts update.
- A plus-one allowance is reduced after the plus-one was named.
- Duplicate guests on import (same name and household or same email).
- A child or infant counts toward meals or headcount differently from an adult.
- The RSVP deadline differs per event or the couple extends it for one household.
- A scheduled send is edited or cancelled before it goes out.
- Changing an email address mid-campaign: unsent messages go to the new address; sent history keeps the old.
- A delivery notification arrives out of order or twice.

## Requirements _(mandatory)_

### Functional Requirements

**Guests and households**

- **FR-001**: The system MUST store households (parties), each with a display name for greetings and addressing, optional postal address, and zero or one shared contact email.
- **FR-002**: The system MUST store guests, each belonging to exactly one household, with first and last name, optional personal email, an adult/child/infant flag, and notes visible only to the couple.
- **FR-003**: The system MUST support a plus-one allowance per household, where a plus-one begins as an unnamed placeholder the household can fill in and is then a regular guest.
- **FR-004**: The couple MUST be able to create, edit, and remove households and guests, and to bulk-import them with per-row error reporting.
- **FR-005**: The system MUST prevent duplicate households and guests where it can detect them (same name within a household, same email across guests) and surface possible duplicates rather than silently merging.

**Events and invitations**

- **FR-006**: The system MUST store wedding events (for example, welcome drinks, rehearsal dinner, ceremony, reception, farewell brunch) with name, start time, and venue name. Longer descriptive text lives in the site code, not here.
- **FR-007**: The system MUST record, per guest and per event, whether the guest is invited, so households can be invited to different sets of events and individuals within a household can differ.
- **FR-008**: Each event MUST support an optional RSVP deadline; there MUST also be a global default deadline.

**RSVPs**

- **FR-009**: The system MUST record, for each invited guest and event, a response of attending, declining, or no response yet, with the time it was given and who gave it (guest or couple on behalf).
- **FR-010**: The system MUST record per guest a meal choice (from a configurable set), dietary restrictions or allergies, and an optional note, and a household-level free-text message to the couple.
- **FR-011**: Guests MUST be able to view and change only their own household's invitations and responses, until the applicable deadline, after which only the couple can change them.
- **FR-012**: The system MUST keep a history of RSVP changes sufficient to answer "what did this guest say, and when did it change".

**Access and identity**

- **FR-013**: Guests MUST be able to access their household's RSVP without creating a password, via a link or sign-in code sent to an email address on file for their household.
- **FR-014**: The system MUST distinguish couple (administrators) from guests; only administrators can see other households' data, the full list, send history, and dashboard.
- **FR-015**: Both Chris and Hannah MUST have equal administrator rights, and the system MUST NOT allow a guest to become an administrator through any guest-facing flow.

**Invitations, reminders, and email**

- **FR-016**: The system MUST store a fixed set of message types (for example, save-the-date, invitation, RSVP reminder, update, thank-you), each tied to a template defined in the codebase.
- **FR-017**: The couple MUST be able to create a send (campaign) specifying message type, recipient selection, and send time (immediate or scheduled), and to cancel or edit it before it goes out.
- **FR-018**: Recipient selection MUST support at least: all households, one household, households that have not responded, households invited to a given event, and households with a delivery problem. Selections MUST exclude households without a deliverable email and list them separately.
- **FR-019**: The system MUST record each message sent as its own record: household, address used at the time, message type, send, timestamp, and delivery status (queued, sent, delivered, bounced, complained, failed).
- **FR-020**: The system MUST be idempotent: re-running a send MUST NOT email a household that already received that send.
- **FR-021**: The system MUST track per-guest or per-household opt-out of non-essential messages (reminders, marketing-style updates) and honor it on every send, while still allowing essential logistics updates.
- **FR-022**: The system MUST update delivery status from provider notifications, tolerating duplicate or out-of-order notifications.

**Dashboard and exports**

- **FR-023**: The couple MUST be able to see, per event, counts of invited, attending, declining, and no response, plus meal and dietary totals and households needing follow-up.
- **FR-024**: The couple MUST be able to export the guest list, responses, and dietary and meal data in a spreadsheet-friendly format, one row per guest per event.

**Website and privacy**

- **FR-025**: Public pages MUST work without any guest data and without signing in; page text MUST NOT be stored in or edited through this data model.
- **FR-026**: Guest data (names, emails, addresses, dietary needs, responses) is personal data: it MUST NOT appear in logs, and seed data and test fixtures MUST be fake.
- **FR-027**: Deleting a guest or household MUST remove or irreversibly anonymize their personal data and keep aggregate counts consistent. [NEEDS CLARIFICATION: after the wedding, should guest data be retained (for thank-you notes and photo sharing), deleted after a fixed period, or deleted on request only?]
- **FR-028**: The system MUST let a household RSVP using its shared contact email even when individual members have no personal email. [NEEDS CLARIFICATION: when a household has several adults, may any one adult respond for everyone, or must each adult sign in and answer only for themselves?]

### Key Entities

- **Household (Party)**: The unit that is invited and written to. Has a display name, postal address, shared contact email, plus-one allowance, RSVP deadline override, and notes. Contains one or more guests.
- **Guest**: A person in exactly one household. Name, optional email, adult/child/infant flag, placeholder-or-named status (for plus-ones), meal choice, dietary needs, opt-out status, couple-only notes.
- **Event**: A wedding-weekend occasion. Name, start time, venue name, optional RSVP deadline, display order.
- **Invitation**: Links one guest to one event they are invited to. Presence means invited.
- **RSVP Response**: A guest's answer for one event (attending, declining, no response), with who answered and when. Linked to the Invitation.
- **RSVP History Entry**: A record of each change to a response, for auditing and for resolving "I never said that".
- **Meal Option**: A selectable meal choice (name, description, which events it applies to).
- **Message Type**: A kind of communication (save-the-date, invitation, reminder, update, thank-you) and whether it is essential or can be opted out of.
- **Send (Campaign)**: One decision by the couple to send a message type to a set of recipients at a time, with status (draft, scheduled, sending, done, cancelled).
- **Message**: One email to one household as part of a send, with address used, timestamp, and delivery status. Delivery notifications update it.
- **Administrator**: A couple member with full access, distinct from guests.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The couple can enter or import a 150-person guest list, with household and per-event invitations assigned, in under 30 minutes.
- **SC-002**: A guest can complete an RSVP for a four-person household across all events in under 3 minutes without help.
- **SC-003**: In acceptance testing, no guest can read or change another household's data (zero leaks across all tested access paths).
- **SC-004**: A reminder to all non-responders reaches 100% of reachable non-responders exactly once, and 0 responders or opted-out guests, even when the send is retried.
- **SC-005**: Dashboard counts match a manual count of the underlying answers in 100% of tested scenarios.
- **SC-006**: Every guest-facing change and every email sent can be traced afterward (who, what, when), answering any "what did we tell them or what did they tell us" question in under 1 minute.
- **SC-007**: Public pages load and are fully readable for a visitor with no account and no guest data present.
- **SC-008**: The caterer export is produced in under 1 minute and needs no manual reformatting.

## Assumptions

- Chris and Hannah are the only administrators; there is no separate role for family helpers in v1.
- The household is the unit of invitation and communication; per-person addressing exists only for personal email and opt-out.
- Per-event invitations are tracked per guest, not per household, to support cases such as a child not invited to the reception.
- Plus-ones are modeled as an allowance of unnamed seats on a household, not a separate concept; extra seats beyond the allowance require the couple's approval.
- Page text, photos, schedule prose, travel info, and registry links are hard-coded in the site. Event name, time, and venue are in the data model only because invitations, RSVPs, and emails need them, so they must be kept consistent with the pages by hand.
- Guests are recognized by email, so the household email needs to exist before a guest can sign in. Households without email are managed by the couple.
- Email delivery uses a third-party provider that reports delivered, bounced, and complained events; the technical choices (identity model, hosting, where sends run, household model) are for the plan and the open decisions in `docs/architecture.md`, not this spec.
- Roughly 100 to 200 guests; performance at larger scale is out of scope.
- Seating charts, gift/registry tracking, SMS, and a guest-facing photo gallery are out of scope for this feature.
