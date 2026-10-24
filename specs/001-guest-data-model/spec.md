# Feature Specification: Guest, Invitation, and Communication Data Model

**Feature Branch**: `ccr-ed2f4b54-3hd6vb` (work happens on the session branch; the spec directory name is independent)

**Created**: 2026-10-18

**Status**: Draft

**Scope**: Backend only. This feature builds the database, access rules, server logic, email pipeline, and two documented interfaces (a guest API and an admin API). It builds **no screens, no visual components, and no email content**: not the public site, not guest-facing screens, not admin screens, and not the subject lines, copy, or designs of any email. Those are built separately (the couple's designer owns visual design), against the interfaces specified here. Where this spec says the couple "see", "open", or "enter" something, it means the capability is available through the admin interface, not that a screen is built here.

**Input**: User description: "Data model for the wedding website: a hard-coded-content website frontend (no CMS) plus guest, household/invite, event, RSVP, and invite/reminder (email) management."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Build and maintain the guest list (Priority: P1)

Chris or Hannah (the "couple") record who is invited: each guest, which household (party) they belong to, which events each guest is invited to, and how to reach the household. They can add, edit, and remove guests and households at any time, import an existing list in bulk, and retrieve the whole list, through the admin interface.

**Why this priority**: Everything else (RSVPs, invitations, reminders) depends on an accurate list of who is invited to what. A usable guest list alone already replaces a spreadsheet.

**Independent Test**: With only this story built, using only the admin interface the couple can create households and guests, assign event invitations, edit them, and retrieve totals per event, with no RSVP or email features present.

**Acceptance Scenarios**:

1. **Given** an empty guest list, **When** the couple adds a household with three guests and invites two of them to the rehearsal dinner and all three to the ceremony, **Then** the household shows three guests with the correct per-event invitations.
2. **Given** an existing household, **When** the couple changes one guest's event invitations, **Then** only that guest's invitations change and other guests are unaffected.
3. **Given** a bulk import file of households and guests, **When** the couple imports it, **Then** valid rows are created, and invalid rows are reported with the row and reason, without creating partial households.
4. **Given** a household with no email address (for example, a relative who gets a paper invitation), **When** the couple saves it, **Then** it is accepted and clearly marked as not reachable by email.

---

### User Story 2 - Guests RSVP for their household (Priority: P1)

A guest follows their personal link or signs in with the email their invitation was sent to, sees only their own household and the events they are invited to, and responds yes or no for each person and each event, and can change their answers until the RSVP deadline. Meal choices and dietary needs are covered in User Story 3, and the optional welcome party and rehearsal in User Story 4. The screens a guest sees are built by the designer; this story covers the data, rules, and interface behind them.

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

The couple enter the menu for each meal event: courses, the dishes offered in each, and tags such as vegetarian, vegan, gluten-free, or contains nuts. Each attending guest picks a dish for each course they must choose (for example, entrée), and tells the couple about dietary restrictions and allergies, either by ticking common categories or in free text. The couple can retrieve totals per dish and a list of restrictions by guest, and export them for the caterer.

**Why this priority**: Catering counts and guest safety depend on it, and it has to be collected at the same time as attendance.

**Independent Test**: With a seeded menu and attending guests, each guest can choose a dish and record restrictions, and the couple's per-dish totals and restriction list match what was entered.

**Acceptance Scenarios**:

1. **Given** a ceremony dinner with a menu of three entrées, **When** an attending guest picks one, **Then** the choice is saved against that guest and event, and the per-dish total increases by one.
2. **Given** a guest who declines the dinner, **When** they view the RSVP, **Then** they are not asked to choose a dish for it.
3. **Given** a guest records a peanut allergy, **When** the couple view the restrictions list, **Then** it appears with the guest's name, household, and a severity (allergy versus preference), and dishes tagged as containing nuts are flagged for that guest.
4. **Given** a guest is invited to a dinner, **When** they respond, **Then** they see only that event's menu.
5. **Given** the menu is unpublished or its choices are closed, **When** a guest views their RSVP, **Then** they can answer attendance but not choose a dish until choices open.
6. **Given** the couple remove a dish that guests have already chosen, **When** they confirm, **Then** the affected guests are listed so they can be asked to choose again, and their previous choice is kept in history.

---

### User Story 4 - Optional welcome party and rehearsal invitations (Priority: P1)

The welcome party and the rehearsal (and dinner) are sub-events of the wedding weekend, and are invited separately from the main events. The couple choose, guest by guest, who is invited to each. An invitation to an optional event is an invitation, not an expectation: a guest who has answered the main events is not treated as "has not responded" just because they have not answered an optional event. The guest interface marks these as optional so a frontend can present them that way, and guests answer yes or no, and the rehearsal invite can go only to the people who need it (for example, the wedding party and immediate family).

**Why this priority**: Both events go to different, smaller groups than the main events and have their own headcounts and meals, so the model must support them from the start.

**Independent Test**: With a seeded list where only some guests are invited to the welcome party and only a different subset to the rehearsal, each guest sees only their own optional events, and headcounts for each are correct and separate (reminder targeting is covered in User Story 5).

**Acceptance Scenarios**:

1. **Given** a guest invited to the ceremony and the welcome party but not the rehearsal, **When** they open their RSVP, **Then** they see the ceremony and the welcome party, with the welcome party labeled optional, and no mention of the rehearsal.
2. **Given** a household that answered every required event but not the optional welcome party, **When** the couple send an RSVP reminder to non-responders, **Then** the household is not included, and a separate "optional events" reminder can target it.
3. **Given** the rehearsal has its own dinner, **When** an invited guest attends, **Then** they choose a dish from the rehearsal menu, not the wedding menu.
4. **Given** the couple choose to invite one more household to the rehearsal after invitations were sent, **When** they add the invitation and send the rehearsal invitation to that household alone, **Then** only that household is emailed.
5. **Given** the couple view the dashboard, **When** they open the welcome party, **Then** they see its own invited, attending, declining, and no-response counts, separate from the other events.

---

### User Story 5 - Send invitations and reminders and track delivery (Priority: P2)

The couple create sends of invitation, reminder, and update emails (the email content itself is supplied separately), choose recipients (everyone, a single household, or a filtered group such as "has not responded" or "invited to the rehearsal dinner"), and send now or schedule. The system records exactly what was sent to whom and when, and whether it was delivered, bounced, or failed, so a reminder never goes to people who already responded unless the couple chooses otherwise, and nobody gets the same message twice by accident.

**Why this priority**: Communication drives response rates, but it only works once the guest list and RSVPs exist.

**Independent Test**: With a seeded guest list, the couple can send a reminder to non-responders only and then see a per-household record of that send and its delivery status.

**Acceptance Scenarios**:

1. **Given** 10 households of which 6 have responded, **When** the couple sends the "RSVP reminder" to non-responders, **Then** exactly 4 households receive it and 4 send records exist.
2. **Given** a message already sent to a household, **When** the same send is triggered again (for example, a retry), **Then** the household is not emailed a second time.
3. **Given** a delivery failure for one address, **When** the status is updated, **Then** the household is flagged for follow-up and the failure is visible to the couple.
4. **Given** a household with no email address, **When** the couple selects "everyone", **Then** that household is skipped and listed as needing a paper invitation.
5. **Given** a household that opted out of reminders, **When** the couple sends a reminder, **Then** that household is excluded, but essential logistics updates can still be sent.

---

### User Story 6 - Reporting and exports (Priority: P2)

The couple can retrieve headcounts per event (invited, attending, declined, no response), meal and dietary totals, households needing follow-up, and can export the list and responses for caterers and venues.

**Why this priority**: Turns the collected data into decisions (catering counts, seating) but is not required to collect it.

**Independent Test**: With seeded RSVPs, totals match a manual count and an export contains one row per guest per event.

**Acceptance Scenarios**:

1. **Given** seeded responses, **When** the couple request the event counts, **Then** per-event counts match the underlying answers exactly.
2. **Given** a guest changes an answer, **When** the couple request the counts again, **Then** they reflect it immediately.

---

### User Story 7 - Wedding planner access (Priority: P2)

The couple give their wedding planner their own sign-in. The planner has the same access as the couple: they can manage the guest list, events, menus, RSVPs, and emails, and read the reports and exports. The planner's actions are recorded under their own name so the couple can tell who changed what. The couple can add or remove the planner's access at any time.

**Why this priority**: The planner works directly with caterers and the venue and needs to look things up and make changes without asking the couple each time.

**Independent Test**: With a seeded planner account, the planner can perform every action the couple can, each change is attributed to the planner, and the couple can revoke access and see it take effect immediately.

**Acceptance Scenarios**:

1. **Given** a signed-in planner, **When** they request the event counts, **Then** they receive counts and meal and dietary totals for every event.
2. **Given** a signed-in planner, **When** they edit a guest's RSVP or send a reminder, **Then** it succeeds and the change is recorded as made by the planner.
3. **Given** the couple remove the planner's access, **When** the planner next makes any request, **Then** it is refused.
4. **Given** a signed-in planner, **When** they try to remove a couple member's access, **Then** it is refused.

---

### User Story 8 - Interface handoff, with all screens out of scope (Priority: P3)

Every screen is out of scope: the public website (home, details, schedule, travel, registry, FAQ), the guest-facing screens including RSVP, and the admin screens. This feature supplies the data, the access rules, and two documented interfaces, a guest interface and an admin interface, that whoever builds those screens calls. The system works whether or not any screen exists.

**Why this priority**: It draws the boundary so no screen or visual component is built by mistake. It matters less than the data features but must be explicit.

**Independent Test**: A client that uses only the published interface documentation can sign in as a guest and RSVP, and sign in as staff and import guests, create a campaign, and read the reports, with no screens present.

**Acceptance Scenarios**:

1. **Given** the published guest interface documentation and a seeded household, **When** a client follows it to sign in and RSVP, **Then** it succeeds without any other knowledge of the system.
2. **Given** the published admin interface documentation and a seeded staff account, **When** a client follows it to import a guest list and read event counts, **Then** it succeeds.
3. **Given** no screens exist, **When** the couple use only the command-line scripts, **Then** they can still import guests and create staff accounts.

---

### Edge Cases

- A household member lacks their own email; the household has one shared contact email.
- Two households want to use one email address (for example, relatives who share one inbox): each household needs its own contact email, so the couple are told when saving and use a different address for one of them. Sign-in and sends never expose one household to another.
- A guest is added to a household after invitations went out: they appear as invited and can be sent a catch-up message without re-sending to others.
- An event invitation is removed after a guest already responded: the response is kept for history but excluded from counts, and the guest no longer sees the event.
- A guest is deleted: their responses and send history are removed or anonymized consistently, and counts update.
- A plus-one allowance is reduced after the plus-one was named.
- Duplicate guests on import (same name and household or same email).
- The RSVP deadline differs per event or the couple extends it for one household.
- A scheduled send is edited or cancelled before it goes out.
- A send is created or comes due for a message type that has no registered template: it is refused or left scheduled with a recorded error, and nothing is sent.
- Changing an email address mid-campaign: unsent messages go to the new address; sent history keeps the old.
- A delivery notification arrives out of order or twice.
- A guest changes from attending to declining after choosing a dish: the dish choice is kept in history but excluded from totals.
- A guest is invited to an optional event but not to any required event (for example, a rehearsal-only guest).
- A guest has several dietary restrictions, or restrictions that conflict with every dish on the menu.
- A menu changes after guests have chosen: dishes removed, renamed, or added.
- The rehearsal and the welcome party have different menus, or no meal at all (drinks only).
- The planner is also a guest, or the planner's email matches a guest household: sign-in as planner never shows guest-only views by mistake, and vice versa.
- A guest's allergy was recorded but the guest is later changed to declining; the dietary and caterer lists should drop them.

## Requirements _(mandatory)_

### Functional Requirements

**Guests and households**

- **FR-001**: The system MUST store households (parties), each with a display name for greetings and addressing, optional postal address, and zero or one shared contact email.
- **FR-002**: The system MUST store guests, each belonging to exactly one household, with first and last name, optional personal email, and notes visible only to the couple.
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
- **FR-033**: An event MAY have no menu at all, in which case guests are not asked to choose dishes for it.
- **FR-034**: The system MUST record a guest's dish choice per course per event. A guest MUST only be able to choose from the menu of an event they are invited to and attending, and from options available to them.
- **FR-035**: The couple MUST be able to open and close choices for a menu independently of attendance, and hold a menu in draft until published.
- **FR-036**: The system MUST record dietary restrictions per guest, as a selection of standard categories (for example, vegetarian, vegan, gluten-free, nut allergy, shellfish allergy, dairy-free, halal, kosher) plus free-text details, each marked as a medical allergy or a preference. A guest's restrictions apply to every event unless the guest says otherwise.
- **FR-037**: The system MUST flag, for each guest, any dish they chose that conflicts with their recorded restrictions according to the dish's tags, and MUST show the couple and planner those flags.
- **FR-038**: The couple MUST be able to change or remove a dish after guests have chosen it; the system MUST list affected guests, keep their previous choice in history, and exclude removed dishes from totals.
- **FR-039**: The system MUST report per event, per course, and per dish the number of attending guests who chose it, the number who have not yet chosen, and a consolidated restrictions list that excludes declining guests.

**Access and identity**

- **FR-013**: Guests MUST be able to access their household's RSVP without creating a password, via a link or sign-in code sent to an email address on file for their household.
- **FR-014**: The system MUST distinguish three kinds of people: couple (administrators), wedding planner, and guests. Only the couple and the planner can see other households' data.
- **FR-015**: Both Chris and Hannah MUST have equal administrator rights, and the system MUST NOT allow a guest or planner to become an administrator through any guest-facing or planner flow.
- **FR-040**: The wedding planner role MUST have the same access as the couple to every feature: guests, households, events, menus, invitations, responses, meals, dietary data, dashboards, exports, and sending email, with no restricted areas.
- **FR-041**: The couple MUST be able to grant and revoke the planner's access, revocation MUST take effect on the planner's next request, and the planner MUST NOT be able to remove or lock out a couple member.
- **FR-042**: The system MUST record who made each change (Chris, Hannah, planner, or guest) so that planner activity is distinguishable from the couple's.

**Invitations, reminders, and email**

- **FR-016**: The system MUST store a fixed set of message types (for example, save-the-date, invitation, RSVP reminder, update, thank-you), each tied to a template key. The template content (subject, body, design) is out of scope and supplied separately; the system MUST refuse to send a message type that has no registered template.
- **FR-017**: The couple MUST be able to create a send (campaign) specifying message type, recipient selection, and send time (immediate or scheduled), and to cancel or edit it before it goes out.
- **FR-018**: Recipient selection MUST support at least: all households, one household, households that have not responded, households invited to a given event (required or optional), households that have not answered a given optional event, households that have not yet chosen meals, households that have not yet been sent a given message type, and households with a delivery problem. Selections MUST exclude households without a deliverable email and list them separately.
- **FR-019**: The system MUST record each message sent as its own record: household, address used at the time, message type, send, timestamp, and delivery status (queued, sent, delivered, bounced, complained, failed).
- **FR-020**: The system MUST be idempotent: re-running a send MUST NOT email a household that already received that send. To avoid repeating a message across different sends, a recipient selection MUST also be able to exclude households that have already been sent a given message type.
- **FR-021**: The system MUST track per-household opt-out of non-essential messages (reminders, marketing-style updates) and honor it on every send, while still allowing essential logistics updates.
- **FR-022**: The system MUST update delivery status from provider notifications, tolerating duplicate or out-of-order notifications.

**Dashboard and exports**

- **FR-023**: The couple and the planner MUST be able to retrieve, per event, counts of invited, attending, declining, and no response, plus meal and dietary totals and households needing follow-up.
- **FR-024**: The couple and the planner MUST be able to export the guest list, responses, meal choices, and dietary data in a spreadsheet-friendly format, one row per guest per event, with a separate caterer-oriented export of per-dish totals and dietary restrictions by event.

**Website and privacy**

- **FR-025**: This feature MUST NOT build, style, or lay out any screen or visual component: not the public site, not any guest-facing screen, and not any admin screen. It MUST NOT write email content either: no subject lines, body copy, or email designs. It defines the template interface and sends whatever a registered template renders. The couple's designer owns visual design, and the email content is supplied separately. Page text MUST NOT be stored in or edited through this data model.
- **FR-043**: The system MUST provide a documented, versioned-in-the-repository guest-facing interface covering sign-in, reading and saving a household's RSVP (attendance, meals, dietary needs, message), naming a plus-one, and reminder opt-out. It MUST return enough event information (required or optional, group, order, deadline, closed state) for any frontend to present the events without extra queries, and MUST be exercisable without any of this repository's screens.
- **FR-044**: The system MUST provide a documented admin-facing interface covering every capability in this spec that the couple and planner use (guest and household management, import, invitations, RSVPs on behalf, events, menus, campaigns and sends, reports, exports, and staff access), made up of direct data access under access rules plus a small set of endpoints for operations that need server secrets. It MUST be exercisable without any screen, and its documentation MUST match the implementation.
- **FR-026**: Guest data (names, emails, addresses, dietary needs, responses) is personal data: it MUST NOT appear in logs, and seed data and test fixtures MUST be fake.
- **FR-027**: The system MUST retain all guest data, responses, and send history until an administrator deletes it; nothing is deleted automatically or on a schedule. Deleting a guest or household MUST remove or irreversibly anonymize their personal data and keep aggregate counts consistent.
- **FR-028**: Each household MUST have exactly one designated responder, one adult whose email is the household's contact email, who answers attendance, meals, and dietary needs for every guest in the household. Other household members have no sign-in of their own, and their personal email, if recorded, is for the couple's reference only.

### Key Entities

- **Household (Party)**: The unit that is invited and written to, with one responder. Has a display name, postal address, shared contact email, plus-one allowance, RSVP deadline override, reminder opt-out, and notes. Contains one or more guests.
- **Guest**: A person in exactly one household. Name, optional email, placeholder-or-named status (for plus-ones), couple-only notes. Dietary restrictions and meal selections attach to the guest.
- **Event**: A wedding-weekend occasion. Name, start time, venue name, optional RSVP deadline, display order, required or optional, and an optional group (for example, "wedding weekend") that ties sub-events together.
- **Invitation**: Links one guest to one event they are invited to, including optional events such as the welcome party and rehearsal. Presence means invited.
- **RSVP Response**: A guest's answer for one event (attending, declining, no response), with who answered and when. Linked to the Invitation.
- **RSVP History Entry**: A record of each change to a response, for auditing and for resolving "I never said that".
- **Menu**: The set of courses and dishes for one event, with a draft, published, or closed state.
- **Course**: An ordered step of a menu (for example, starter, entrée, dessert) and whether guests must choose a dish.
- **Dish**: One selectable option within a course, with name, description, and dietary tags.
- **Meal Selection**: One guest's chosen dish for one course at one event, with who chose it and when. Kept in history when changed or when a dish is removed.
- **Dietary Restriction**: A guest's standard category or free-text restriction, marked allergy or preference.
- **Message Type**: A kind of communication (save-the-date, invitation, reminder, update, thank-you) and whether it is essential or can be opted out of.
- **Send (Campaign)**: One decision by the couple to send a message type to a set of recipients at a time, with status (draft, scheduled, sending, done, cancelled).
- **Message**: One email to one household as part of a send, with address used, timestamp, and delivery status. Delivery notifications update it.
- **Administrator**: A couple member with full access, distinct from guests.
- **Planner Access**: The wedding planner's sign-in, with the same access as an administrator, granted and revoked by the couple.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A 150-person guest list import file, with households and per-event invitations, is processed in under 1 minute, with every invalid row reported by number and reason and no partial households created.
- **SC-002**: A client can complete an RSVP for a four-person household across all events with one read request and one save request, and every validation failure comes back with enough detail to show the guest what to fix.
- **SC-003**: In acceptance testing, no guest can read or change another household's data (zero leaks across all tested access paths).
- **SC-004**: A reminder to all non-responders reaches 100% of reachable non-responders exactly once, and 0 responders or opted-out households, even when the send is retried.
- **SC-005**: Reported counts match a manual count of the underlying answers in 100% of tested scenarios.
- **SC-006**: Every guest-facing change and every email sent can be traced afterward (who, what, when), answering any "what did we tell them or what did they tell us" question in under 1 minute.
- **SC-007**: A developer who has only the published guest and admin interface documentation can build a working guest RSVP flow and the admin functions without asking the backend authors a question, and automated checks confirm each document matches its interface.
- **SC-008**: The caterer export is produced in under 1 minute and needs no manual reformatting.
- **SC-009**: In acceptance testing, 100% of dishes chosen by attending guests appear in per-dish totals exactly once, and 0 choices by declining guests do.
- **SC-010**: Every recorded allergy for an attending guest appears on the dietary list, and every chosen dish whose tags conflict with an allergy is flagged.
- **SC-011**: A guest invited only to optional events and a guest invited to required events plus optional ones each see exactly their own events, and a "has not responded" reminder never includes someone who has answered every required event.
- **SC-012**: A planner can perform every couple action without the couple's help, 100% of planner changes are attributed to the planner, and the planner cannot remove a couple member's access.

## Assumptions

- Chris and Hannah are the only administrators. The wedding planner has the same access as the couple but is a distinct, attributable account the couple can revoke. There is no role for family helpers in v1, and there is one planner account.
- The welcome party and rehearsal are modeled as ordinary events marked optional and grouped under the wedding weekend, not a separate kind of record, so they share the same invitations, RSVP, meal, and reminder machinery.
- Menus are entered by the couple in the system (unlike page text, which is hard-coded) because guests choose from them and totals depend on them. Any menu text on the designer's pages is separate and must be kept in sync by hand.
- No children are invited, so the data model has no child or infant distinction and no children's menu.
- Data is kept indefinitely; the couple delete it manually when they choose.
- Dietary restrictions are asked once per guest and apply to all events, with a free-text note for event-specific cases.
- A standard set of dietary categories and tags is provided; the couple can add more.
- The household is the unit of invitation and communication: all email goes to the household's contact email, and opt-out is per household. A guest's own email, if recorded, is for the couple's reference only.
- Per-event invitations are tracked per guest, not per household, to support cases such as a guest invited to the ceremony but not the reception.
- Plus-ones are modeled as an allowance of unnamed seats on a household, not a separate concept; extra seats beyond the allowance require the couple's approval.
- The designer, or whoever builds the screens, builds all public pages, guest-facing screens, and admin screens, with their own hard-coded content. Event name, time, and venue are in the data model only because invitations, RSVPs, and emails need them, so the designer's schedule must be kept consistent with them by hand.
- No admin screens are built here. They are built separately (likely by the designer), against the admin interface, and served from the same site as this backend. To be confirmed with the designer. Until they exist, the couple can use the command-line scripts and the database dashboard.
- The guest and admin frontends are served from the same site as this backend, so sign-in sessions are same-origin cookies. To be confirmed with the designer.
- Guests are recognized by email, so the household email needs to exist before a guest can sign in. Households without email are managed by the couple.
- Email delivery uses a third-party provider that reports delivered, bounced, and complained events; the technical choices (identity model, hosting, where sends run, household model) are for the plan and the open decisions in `docs/architecture.md`, not this spec.
- Roughly 100 to 200 guests across a few events; performance at larger scale is out of scope.
- Seating charts, gift/registry tracking, SMS, and a guest-facing photo gallery are out of scope for this feature.
- Visual design, every screen (public, guest-facing, and admin), every other visual component, and all email content (subjects, copy, designs) are out of scope. The designer, or whoever writes the emails, owns them. Until a template is supplied for a message type, production sends of that type are blocked.
