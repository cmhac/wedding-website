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

A guest follows their personal link or signs in with the email their invitation was sent to, sees only their own household and the events they are invited to, and responds yes or no for each person and each event, and can change their answers until the RSVP deadline. Meal choices and dietary needs are covered in User Story 3, and the optional welcome party and rehearsal in User Story 4.

**Why this priority**: Collecting accurate responses is the core purpose of the guest-facing part of the site.

**Independent Test**: With a seeded household, a guest can open their RSVP, answer for every invited person and event, save, return later, and see and change their saved answers.

**Acceptance Scenarios**:

1. **Given** a household invited to two events, **When** a member responds for each person and event, **Then** every answer is saved and shown back on return.
2. **Given** a guest invited only to the ceremony, **When** they view their RSVP, **Then** they see no other events.
3. **Given** the RSVP deadline has passed, **When** a guest tries to change an answer, **Then** the change is refused with a message to contact the couple, while the couple can still edit on their behalf.
4. **Given** two different households, **When** a guest of one tries to view or change the other's RSVP, **Then** access is denied.
5. **Given** a household allowed one plus-one, **When** the guest names the plus-one, **Then** the plus-one is recorded as a guest in that household with their own answers.

---

### User Story 3 - Publish a menu and collect meal choices and dietary needs (Priority: P1)

The couple enter the menu for each meal event: courses, the dishes offered in each, and tags such as vegetarian, vegan, gluten-free, or contains nuts. Each attending guest picks a dish for each course they must choose (for example, entrée), and tells the couple about dietary restrictions and allergies, either by ticking common categories or in free text. The couple see totals per dish and a list of restrictions by guest, and can export them for the caterer.

**Why this priority**: Catering counts and guest safety depend on it, and it has to be collected at the same time as attendance.

**Independent Test**: With a seeded menu and attending guests, each guest can choose a dish and record restrictions, and the couple's per-dish totals and restriction list match what was entered.

**Acceptance Scenarios**:

1. **Given** a ceremony dinner with a menu of three entrées, **When** an attending guest picks one, **Then** the choice is saved against that guest and event, and the per-dish total increases by one.
2. **Given** a guest who declines the dinner, **When** they view the RSVP, **Then** they are not asked to choose a dish for it.
3. **Given** a guest records a peanut allergy, **When** the couple view the restrictions list, **Then** it appears with the guest's name, household, and a severity (allergy versus preference), and dishes tagged as containing nuts are flagged for that guest.
4. **Given** a child is invited to the dinner, **When** they respond, **Then** they may be offered a children's menu if the couple has defined one for that event.
5. **Given** the menu is unpublished or its choices are closed, **When** a guest views their RSVP, **Then** they can answer attendance but not choose a dish until choices open.
6. **Given** the couple remove a dish that guests have already chosen, **When** they confirm, **Then** the affected guests are listed so they can be asked to choose again, and their previous choice is kept in history.

---

### User Story 4 - Optional welcome party and rehearsal invitations (Priority: P1)

The welcome party and the rehearsal (and dinner) are sub-events of the wedding weekend, and are invited separately from the main events. The couple choose, guest by guest, who is invited to each. An invitation to an optional event is an invitation, not an expectation: a guest who has answered the main events is not treated as "has not responded" just because they have not answered an optional event. Guests see these as clearly optional and answer yes or no, and the rehearsal invite can go only to the people who need it (for example, the wedding party and immediate family).

**Why this priority**: Both events go to different, smaller groups than the main events and have their own headcounts and meals, so the model must support them from the start.

**Independent Test**: With a seeded list where only some guests are invited to the welcome party and only a different subset to the rehearsal, each guest sees only their own optional events, and headcounts and reminders for each are correct and separate.

**Acceptance Scenarios**:

1. **Given** a guest invited to the ceremony and the welcome party but not the rehearsal, **When** they open their RSVP, **Then** they see the ceremony and the welcome party, with the welcome party labeled optional, and no mention of the rehearsal.
2. **Given** a household that answered every required event but not the optional welcome party, **When** the couple send an RSVP reminder to non-responders, **Then** the household is not included, and a separate "optional events" reminder can target it.
3. **Given** the rehearsal has its own dinner, **When** an invited guest attends, **Then** they choose a dish from the rehearsal menu, not the wedding menu.
4. **Given** the couple choose to invite one more household to the rehearsal after invitations were sent, **When** they add the invitation, **Then** only that household is sent the rehearsal invitation.
5. **Given** the couple view the dashboard, **When** they open the welcome party, **Then** they see its own invited, attending, declining, and no-response counts, separate from the other events.

---

### User Story 5 - Send invitations and reminders and track delivery (Priority: P2)

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

### User Story 6 - Couple's dashboard and exports (Priority: P2)

The couple see headcounts per event (invited, attending, declined, no response), meal and dietary totals, households needing follow-up, and can export the list and responses for caterers and venues.

**Why this priority**: Turns the collected data into decisions (catering counts, seating) but is not required to collect it.

**Independent Test**: With seeded RSVPs, totals match a manual count and an export contains one row per guest per event.

**Acceptance Scenarios**:

1. **Given** seeded responses, **When** the couple opens the dashboard, **Then** per-event counts match the underlying answers exactly.
2. **Given** a guest changes an answer, **When** the couple refreshes, **Then** counts reflect it immediately.

---

### User Story 7 - Wedding planner access (Priority: P2)

The couple give their wedding planner their own sign-in with narrower access than the couple's. The planner can see the schedule of events, headcounts, attending guests, meal choices and dietary restrictions, and export what vendors need. The planner cannot see the couple's private notes, cannot see or change who is an administrator, and cannot see guests' postal addresses unless the couple allow it. The couple can add or remove the planner's access at any time.

**Why this priority**: The planner needs accurate counts and dietary lists to work with caterers and the venue, but should not carry the couple's full authority over the guest list or communications.

**Independent Test**: With a seeded planner account, the planner can open the dashboard and exports but is refused when trying to view couple-only notes, change the guest list, or send email, and the couple can revoke access and see it take effect immediately.

**Acceptance Scenarios**:

1. **Given** a signed-in planner, **When** they open the dashboard, **Then** they see counts and meal and dietary totals for every event.
2. **Given** a signed-in planner, **When** they try to view couple-only notes or manage who has access, **Then** access is denied.
3. **Given** the couple remove the planner's access, **When** the planner next makes any request, **Then** it is refused.
4. **Given** a planner, **When** they view the guest list, **Then** they see names, household, events, responses, meals and dietary needs, but not private notes.

---

### User Story 8 - Public website content stays in the code (Priority: P3)

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
- A guest changes from attending to declining after choosing a dish: the dish choice is kept in history but excluded from totals.
- A guest is invited to an optional event but not to any required event (for example, a rehearsal-only guest).
- A guest has several dietary restrictions, or restrictions that conflict with every dish on the menu.
- A menu changes after guests have chosen: dishes removed, renamed, or added.
- The rehearsal and the welcome party have different menus, or no meal at all (drinks only).
- The planner is also a guest, or the planner's email matches a guest household.
- A guest's allergy was recorded but the guest is later changed to declining; the planner's and caterer's lists should drop them.

## Requirements _(mandatory)_

### Functional Requirements

**Guests and households**

- **FR-001**: The system MUST store households (parties), each with a display name for greetings and addressing, optional postal address, and zero or one shared contact email.
- **FR-002**: The system MUST store guests, each belonging to exactly one household, with first and last name, optional personal email, an adult/child/infant flag, and notes visible only to the couple.
- **FR-003**: The system MUST support a plus-one allowance per household, where a plus-one begins as an unnamed placeholder the household can fill in and is then a regular guest.
- **FR-004**: The couple MUST be able to create, edit, and remove households and guests, and to bulk-import them with per-row error reporting.
- **FR-005**: The system MUST prevent duplicate households and guests where it can detect them (same name within a household, same email across guests) and surface possible duplicates rather than silently merging.

**Events and invitations**

- **FR-006**: The system MUST store wedding events (for example, welcome party, rehearsal, rehearsal dinner, ceremony, reception, farewell brunch) with name, start time, venue name, and display order. Longer descriptive text lives in the site code, not here.
- **FR-007**: The system MUST record, per guest and per event, whether the guest is invited, so households can be invited to different sets of events and individuals within a household can differ.
- **FR-008**: Each event MUST support an optional RSVP deadline; there MUST also be a global default deadline.
- **FR-029**: Each event MUST be marked as either required (all invited guests are expected to respond) or optional (such as the welcome party and rehearsal). Optional events MUST NOT cause a guest or household to count as "has not responded" for required events, and MUST have their own counts, reminders, and selections.
- **FR-030**: Events MUST be able to belong to a group (for example, "wedding weekend") so that sub-events are shown and reported together while remaining separately invitable.
- **FR-031**: The couple MUST be able to invite a single guest or household to one event after initial invitations have gone out, without affecting existing invitations or triggering sends to others.

**RSVPs**

- **FR-009**: The system MUST record, for each invited guest and event, a response of attending, declining, or no response yet, with the time it was given and who gave it (guest or couple on behalf).
- **FR-010**: The system MUST record, for each attending guest and each event that serves a meal, a selection for each course the guest must choose, plus a household-level free-text message to the couple.
- **FR-011**: Guests MUST be able to view and change only their own household's invitations and responses, until the applicable deadline, after which only the couple can change them.
- **FR-012**: The system MUST keep a history of RSVP changes sufficient to answer "what did this guest say, and when did it change".

**Menus, meal choices, and dietary needs**

- **FR-032**: The couple MUST be able to enter a menu per event: an ordered set of courses, and for each course the dishes offered, each with a name, an optional description, and dietary tags (for example, vegetarian, vegan, gluten-free, dairy-free, contains nuts, contains shellfish, halal, kosher).
- **FR-033**: A menu MUST be able to include audience-specific options, such as a children's menu available only to guests flagged as children, and an event MAY have no menu at all.
- **FR-034**: The system MUST record a guest's dish choice per course per event. A guest MUST only be able to choose from the menu of an event they are invited to and attending, and from options available to them.
- **FR-035**: The couple MUST be able to open and close choices for a menu independently of attendance, and hold a menu in draft until published.
- **FR-036**: The system MUST record dietary restrictions per guest, as a selection of standard categories (for example, vegetarian, vegan, gluten-free, nut allergy, shellfish allergy, dairy-free, halal, kosher) plus free-text details, each marked as a medical allergy or a preference. A guest's restrictions apply to every event unless the guest says otherwise.
- **FR-037**: The system MUST flag, for each guest, any dish they chose that conflicts with their recorded restrictions according to the dish's tags, and MUST show the couple and planner those flags.
- **FR-038**: The couple MUST be able to change or remove a dish after guests have chosen it; the system MUST list affected guests, keep their previous choice in history, and exclude removed dishes from totals.
- **FR-039**: The system MUST report per event, per course, and per dish the number of attending guests who chose it, the number who have not yet chosen, and a consolidated restrictions list that excludes declining guests.

**Access and identity**

- **FR-013**: Guests MUST be able to access their household's RSVP without creating a password, via a link or sign-in code sent to an email address on file for their household.
- **FR-014**: The system MUST distinguish three kinds of people: couple (administrators), wedding planner, and guests. Only the couple and the planner can see other households' data, within the limits below.
- **FR-015**: Both Chris and Hannah MUST have equal administrator rights, and the system MUST NOT allow a guest or planner to become an administrator through any guest-facing or planner flow.
- **FR-040**: The wedding planner role MUST have read access to events, menus, guests, households' names and contact details, invitations, responses, meal choices, dietary restrictions, counts, and exports. It MUST NOT see the couple's private notes or manage who has access. [NEEDS CLARIFICATION: may the planner also edit the guest list and RSVPs on the couple's behalf, send emails, and see guests' postal addresses, or is the planner strictly read-only?]
- **FR-041**: Only the couple MUST be able to grant, change, or revoke the planner's access, and revocation MUST take effect on the planner's next request.
- **FR-042**: The system MUST record who made each change (couple member, planner, guest) so that planner activity is distinguishable from the couple's.

**Invitations, reminders, and email**

- **FR-016**: The system MUST store a fixed set of message types (for example, save-the-date, invitation, RSVP reminder, update, thank-you), each tied to a template defined in the codebase.
- **FR-017**: The couple MUST be able to create a send (campaign) specifying message type, recipient selection, and send time (immediate or scheduled), and to cancel or edit it before it goes out.
- **FR-018**: Recipient selection MUST support at least: all households, one household, households that have not responded, households invited to a given event (required or optional), households that have not answered a given optional event, households that have not yet chosen meals, and households with a delivery problem. Selections MUST exclude households without a deliverable email and list them separately.
- **FR-019**: The system MUST record each message sent as its own record: household, address used at the time, message type, send, timestamp, and delivery status (queued, sent, delivered, bounced, complained, failed).
- **FR-020**: The system MUST be idempotent: re-running a send MUST NOT email a household that already received that send.
- **FR-021**: The system MUST track per-guest or per-household opt-out of non-essential messages (reminders, marketing-style updates) and honor it on every send, while still allowing essential logistics updates.
- **FR-022**: The system MUST update delivery status from provider notifications, tolerating duplicate or out-of-order notifications.

**Dashboard and exports**

- **FR-023**: The couple and the planner MUST be able to see, per event, counts of invited, attending, declining, and no response, plus meal and dietary totals; the couple MUST also see households needing follow-up.
- **FR-024**: The couple and the planner MUST be able to export the guest list, responses, meal choices, and dietary data in a spreadsheet-friendly format, one row per guest per event, with a separate caterer-oriented export of per-dish totals and dietary restrictions by event.

**Website and privacy**

- **FR-025**: Public pages MUST work without any guest data and without signing in; page text MUST NOT be stored in or edited through this data model.
- **FR-026**: Guest data (names, emails, addresses, dietary needs, responses) is personal data: it MUST NOT appear in logs, and seed data and test fixtures MUST be fake.
- **FR-027**: Deleting a guest or household MUST remove or irreversibly anonymize their personal data and keep aggregate counts consistent. [NEEDS CLARIFICATION: after the wedding, should guest data be retained (for thank-you notes and photo sharing), deleted after a fixed period, or deleted on request only?]
- **FR-028**: The system MUST let a household RSVP using its shared contact email even when individual members have no personal email. [NEEDS CLARIFICATION: when a household has several adults, may any one adult respond for everyone, or must each adult sign in and answer only for themselves?]

### Key Entities

- **Household (Party)**: The unit that is invited and written to. Has a display name, postal address, shared contact email, plus-one allowance, RSVP deadline override, and notes. Contains one or more guests.
- **Guest**: A person in exactly one household. Name, optional email, adult/child/infant flag, placeholder-or-named status (for plus-ones), opt-out status, couple-only notes. Dietary restrictions and meal selections attach to the guest.
- **Event**: A wedding-weekend occasion. Name, start time, venue name, optional RSVP deadline, display order, required or optional, and an optional group (for example, "wedding weekend") that ties sub-events together.
- **Invitation**: Links one guest to one event they are invited to, including optional events such as the welcome party and rehearsal. Presence means invited.
- **RSVP Response**: A guest's answer for one event (attending, declining, no response), with who answered and when. Linked to the Invitation.
- **RSVP History Entry**: A record of each change to a response, for auditing and for resolving "I never said that".
- **Menu**: The set of courses and dishes for one event, with a draft, published, or closed state.
- **Course**: An ordered step of a menu (for example, starter, entrée, dessert) and whether guests must choose a dish.
- **Dish**: One selectable option within a course, with name, description, dietary tags, and who it is available to (all guests, or children only).
- **Meal Selection**: One guest's chosen dish for one course at one event, with who chose it and when. Kept in history when changed or when a dish is removed.
- **Dietary Restriction**: A guest's standard category or free-text restriction, marked allergy or preference.
- **Message Type**: A kind of communication (save-the-date, invitation, reminder, update, thank-you) and whether it is essential or can be opted out of.
- **Send (Campaign)**: One decision by the couple to send a message type to a set of recipients at a time, with status (draft, scheduled, sending, done, cancelled).
- **Message**: One email to one household as part of a send, with address used, timestamp, and delivery status. Delivery notifications update it.
- **Administrator**: A couple member with full access, distinct from guests.
- **Planner Access**: The wedding planner's sign-in and permissions, granted and revoked by the couple, narrower than an administrator's.

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
- **SC-009**: In acceptance testing, 100% of dishes chosen by attending guests appear in per-dish totals exactly once, and 0 choices by declining guests do.
- **SC-010**: Every recorded allergy for an attending guest appears on the dietary list, and every chosen dish whose tags conflict with an allergy is flagged.
- **SC-011**: A guest invited only to optional events and a guest invited to required events plus optional ones each see exactly their own events, and a "has not responded" reminder never includes someone who has answered every required event.
- **SC-012**: A planner can complete all tasks in User Story 7 without the couple's help and in 100% of tested cases cannot read couple-only notes or change access.

## Assumptions

- Chris and Hannah are the only administrators. The wedding planner is a separate, narrower role. There is no role for family helpers in v1, and there is one planner account.
- The welcome party and rehearsal are modeled as ordinary events marked optional and grouped under the wedding weekend, not a separate kind of record, so they share the same invitations, RSVP, meal, and reminder machinery.
- Menus are entered by the couple in the system (unlike page text, which is hard-coded) because guests choose from them and totals depend on them. The public menu text on pages is hard-coded separately and must be kept in sync by hand.
- Dietary restrictions are asked once per guest and apply to all events, with a free-text note for event-specific cases.
- A standard set of dietary categories and tags is provided; the couple can add more.
- The household is the unit of invitation and communication; per-person addressing exists only for personal email and opt-out.
- Per-event invitations are tracked per guest, not per household, to support cases such as a child not invited to the reception.
- Plus-ones are modeled as an allowance of unnamed seats on a household, not a separate concept; extra seats beyond the allowance require the couple's approval.
- Page text, photos, schedule prose, travel info, and registry links are hard-coded in the site. Event name, time, and venue are in the data model only because invitations, RSVPs, and emails need them, so they must be kept consistent with the pages by hand.
- Guests are recognized by email, so the household email needs to exist before a guest can sign in. Households without email are managed by the couple.
- Email delivery uses a third-party provider that reports delivered, bounced, and complained events; the technical choices (identity model, hosting, where sends run, household model) are for the plan and the open decisions in `docs/architecture.md`, not this spec.
- Roughly 100 to 200 guests across a few events; performance at larger scale is out of scope.
- Seating charts, gift/registry tracking, SMS, and a guest-facing photo gallery are out of scope for this feature.
