# Feature Specification: Admin Console v0

**Feature Branch**: `ccr-148acb64-gkxwqr`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Admin console v0 (functional test UI). A deliberately minimal, unstyled admin interface for the couple and planner, built on the existing admin API and direct staff data access, so the team can exercise every admin capability end to end before the creative director's visual design arrives. Visuals are throwaway."

## Overview

The guest data model and the admin API already exist, but nobody can use them without scripts or the database dashboard. This feature adds a bare-bones admin console so Chris, Hannah and the planner can sign in and exercise every admin capability end to end. Its purpose is to test functionality and find gaps in the API and data model while the creative director's visual design is still in progress.

The console is a **throwaway test interface**. It carries no branding, no theming and no design system. Presentation is plain, standard page elements only, kept separate from behavior so the later design can replace it without redoing the behavior.

This feature deliberately supersedes the repository's current "backend only, build no screens" scope for admin screens only. Guest-facing screens (public site, RSVP) stay out of scope, as does email content. The repository rules that state the old scope (the Scope and Layout sections of `CLAUDE.md`, and the "no user interface" notices in the admin handoff document) must be updated as part of this feature, not left stale (FR-033).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign in and see where things stand (Priority: P1)

A staff member (couple or planner) requests a sign-in link, follows it, and lands on an overview showing, per event, how many households and guests are invited, attending, declined and pending, plus how many households still have required answers or meal choices outstanding.

**Why this priority**: Nothing else is reachable without sign-in, and the overview is the quickest proof that the console reads real data under staff permissions.

**Independent Test**: With a seeded staff account and sample guest list, sign in via the emailed link and confirm the overview numbers match the underlying data; confirm a guest account and a signed-out visitor cannot see it.

**Acceptance Scenarios**:

1. **Given** a staff email, **When** the user requests a sign-in link and follows it, **Then** they land on the admin overview signed in.
2. **Given** a signed-in staff member, **When** they open the overview, **Then** they see per-event invited, attending, declined and pending counts and the count of households with outstanding required answers, optional answers and meal choices.
3. **Given** a signed-out visitor or a guest account, **When** they open any admin page, **Then** they see no admin data and are directed to sign in or told they lack access.
4. **Given** a signed-in staff member, **When** they sign out, **Then** admin pages are no longer accessible without signing in again.

---

### User Story 2 - Manage households and guests (Priority: P1)

Staff browse and search households, open one to see its guests, invitations, RSVP status and meal choices, and create, edit or delete households and guests. They set plus-one allowance, the household's RSVP deadline override, staff-only notes and the contact email, and see the delivery-problem flag. They can review possible duplicate households.

**Why this priority**: The guest list is the core data of the whole site; every other function depends on it being correct.

**Independent Test**: Create a household with two guests and a plus-one allowance, edit its contact email, find it by search, delete it, and confirm each change shows in the list and (for sign-in email changes) is accepted or rejected as the API specifies.

**Acceptance Scenarios**:

1. **Given** the household list, **When** staff search by household or guest name, **Then** only matching households appear.
2. **Given** the create form, **When** staff submit a household with a name, optional contact email, allowance and guests, **Then** it appears in the list; a duplicate contact email shows the API's error message and creates nothing.
3. **Given** a household detail page, **When** staff change the contact email to one used by another household, **Then** the change is refused with a clear message and nothing changes.
4. **Given** a household, **When** staff reduce the plus-one allowance below the number of named plus-ones, **Then** the console shows the refusal message from the data layer.
5. **Given** a household flagged with a delivery problem, **When** staff view the list or detail, **Then** the flag is visible, and it is cleared after the contact email changes.
6. **Given** staff open the duplicates view, **When** it loads, **Then** possible duplicate household pairs are listed with links to each, and nothing is merged automatically.
7. **Given** a household, **When** staff delete it after confirming, **Then** the household, its guests and its sign-in account are gone from the console.

---

### User Story 3 - Import the guest list from a CSV or Excel file (Priority: P1)

Staff upload a guest list as a CSV or Excel file and see how many households were created and, for any row that failed, the row number, field and message, without the good rows being lost.

**Why this priority**: Importing is how the real guest list will arrive, and it will most likely start life as a spreadsheet; it must be testable before real data is loaded.

**Independent Test**: Upload a CSV and an Excel file, each with valid rows and some deliberately bad rows, and confirm created counts and per-row errors are the same for both.

**Acceptance Scenarios**:

1. **Given** a valid CSV or Excel file, **When** staff upload it, **Then** the created count is shown and the households appear in the list.
2. **Given** a file with bad rows, **When** staff upload it, **Then** each error shows row, field and message, and valid rows are still imported.
3. **Given** a file that is not a usable CSV or Excel file, **When** staff upload it, **Then** a clear whole-file error is shown.
4. **Given** an Excel file with more than one sheet, **When** staff upload it, **Then** the console states which sheet was read.

---

### User Story 4 - Events, invitations and answering on behalf (Priority: P2)

Staff create and edit events (name, date, venue, required or optional, group, deadline, order), invite guests to an event (including later additions), and record an RSVP and meal choices on a household's behalf, for example for paper responses.

**Why this priority**: RSVP tracking is the point of the site, but it needs households (above) first.

**Independent Test**: Create an optional event, invite two guests, then record one attending with a meal choice and one declined on their behalf, and confirm the overview counts change and each answer is labelled as recorded by staff, not by the guest.

**Acceptance Scenarios**:

1. **Given** the events page, **When** staff create or edit an event, **Then** it is saved and listed in display order.
2. **Given** a set of guests, **When** staff invite them to an event, **Then** each shows a pending invitation.
3. **Given** a pending invitation, **When** staff record attending or declined on the household's behalf, **Then** the status updates, and declining clears that guest's meal selections for the event.
4. **Given** staff act after the RSVP deadline or with RSVPs closed, **When** they record an answer, **Then** it is accepted (staff are not bound by the deadline).
5. **Given** an RSVP or meal choice that staff recorded for a household, **When** anyone views the invitation, the household, or the history pages, **Then** it is clearly marked as recorded by staff, naming which staff member and when, and is distinguishable from an answer the guest gave themselves.
6. **Given** an answer first recorded by staff and later changed by the guest (or the reverse), **When** staff open the history, **Then** each step shows who made it (guest or named staff member), so the source of the current answer is never ambiguous.

---

### User Story 5 - Menus, dishes and dietary categories (Priority: P2)

Staff manage each event's menu: status (draft, published, closed), courses, dishes, and dietary tags on dishes; manage the list of dietary categories; and archive a dish, seeing which guests are affected so they can be asked again.

**Why this priority**: Meal choices need menus, but the guest list and RSVPs come first.

**Independent Test**: Build a menu with two courses and three dishes, tag one dish, publish it, then archive a chosen dish and confirm the affected guests are listed.

**Acceptance Scenarios**:

1. **Given** an event, **When** staff add courses and dishes and set the menu to published, **Then** the menu shows its new status and contents.
2. **Given** a dish, **When** staff tag it with dietary categories, **Then** the tags show with the meaning for diet versus allergen categories.
3. **Given** a dish that guests have chosen, **When** staff archive it, **Then** the console lists the affected guests and the dish no longer appears as choosable.
4. **Given** the categories page, **When** staff add a category, **Then** it is available for tagging.

---

### User Story 6 - Campaigns and delivery status (Priority: P2)

Staff create a campaign by choosing a message type and an audience (all, one household, or filters), preview exactly who it reaches and who has no email or has opted out, save it as a draft, schedule it, send it now, or cancel it. After sending, they see delivery status per household.

**Why this priority**: Sending email to real people is high-impact and must be rehearsed before the real send; it depends on households and events.

**Independent Test**: Create a campaign targeting households with unanswered required events, preview the audience, send it, and watch statuses progress for each household; confirm a sent campaign can no longer be edited.

**Acceptance Scenarios**:

1. **Given** the campaign form, **When** staff choose an audience, **Then** a preview lists matching households and flags those not deliverable with the reason (no email, opted out).
2. **Given** an invalid audience, **When** staff try to save, **Then** the error is shown and nothing is saved.
3. **Given** a draft or scheduled campaign, **When** staff edit, schedule, cancel, or send it now (after a confirmation step), **Then** the status updates accordingly.
4. **Given** a campaign whose message type has no registered template, **When** staff send it, **Then** the console shows the "template missing" error and nothing is sent.
5. **Given** a campaign that is sending or done, **When** staff open it, **Then** it is read-only and shows per-household delivery status.

---

### User Story 7 - Reports, exports and history (Priority: P3)

Staff view dish totals, the dietary list (attending guests with restrictions) and meal conflicts (chosen dishes that clash with restrictions), download the guest, response and caterer CSV exports, and read change history: who changed what, RSVP history and meal selection history.

**Why this priority**: Needed close to the event and for the caterer; the data feeding them is built by the earlier stories.

**Independent Test**: With sample responses, open each report and compare to the data, download each export and open it, and make a change then find it in the audit log attributed to the right staff member.

**Acceptance Scenarios**:

1. **Given** sample responses, **When** staff open dish totals, the dietary list and meal conflicts, **Then** each shows data consistent with the underlying choices, filterable by event.
2. **Given** the exports page, **When** staff download the guests, responses or caterer export, **Then** a CSV file downloads.
3. **Given** a recent change, **When** staff open the history pages, **Then** the change appears with who, when and which fields (never the values), and RSVP and meal changes show their status or dish transitions without names.

---

### User Story 8 - Settings and staff access (Priority: P3)

Staff change the default RSVP deadline and whether RSVPs are open. The couple (not the planner) can see staff, grant planner access and revoke access.

**Why this priority**: Rarely changed, but the open/closed switch and staff access are needed before launch.

**Independent Test**: Toggle RSVPs closed and confirm the setting persists; as a planner, confirm staff-management actions are unavailable; as a couple member, grant and revoke planner access and confirm the last couple member cannot be removed.

**Acceptance Scenarios**:

1. **Given** the settings page, **When** staff change the default deadline or the RSVPs-open switch, **Then** the new values persist and show on reload.
2. **Given** a planner is signed in, **When** they open staff access, **Then** they can see staff but cannot grant or revoke.
3. **Given** a couple member, **When** they grant planner access, **Then** the planner appears in the list and can sign in.
4. **Given** the only remaining couple member, **When** they try to remove themselves, **Then** the console shows that the last couple member cannot be removed.

---

### Edge Cases

- Session expires mid-task: the next action sends the user to sign in rather than showing a raw error, and unsaved form input is not silently discarded where the form can show it again.
- Any API or data error is shown as its human-readable message; internal text is never shown, and guest data (emails, addresses) never appears in logs.
- Destructive actions (delete household, send campaign, archive dish, revoke staff access) require an explicit confirmation step.
- Lists with no rows show an explicit empty message, not a blank page.
- A household with no contact email (paper-only) is listed and clearly labelled, and appears in audience previews with its skip reason.
- Staff-only fields (notes, address, delivery problem, deadline override) are shown only to staff and never exposed to guests.
- Two staff edit the same record: the later save wins and both changes appear in the audit log.
- Large lists (hundreds of households) remain usable through search and paging.
- A planner who opens a couple-only page directly is told they lack access.

## Requirements _(mandatory)_

### Functional Requirements

**Access**

- **FR-001**: The console MUST be reachable only by signed-in staff; signed-out visitors and guest accounts MUST see no admin data.
- **FR-002**: Staff MUST be able to request a sign-in link, complete sign-in from it, and sign out. The sign-in request MUST show the same neutral message whether or not the address belongs to a staff account.
- **FR-003**: Staff-management actions MUST be available only to couple members; planners MUST see staff but not change them.

**Overview**

- **FR-004**: The overview MUST show, per event, invited, attending, declined and pending counts, and per-household outstanding required answers, optional answers and meal choices.

**Households and guests**

- **FR-005**: Staff MUST be able to list and search households by household or guest name, and open a household to see all its details, including staff-only fields.
- **FR-006**: Staff MUST be able to create, edit and delete households and their guests, including contact email, address, plus-one allowance, deadline override, reminders opt-out, message to the couple, staff notes, and guest dietary notes.
- **FR-007**: The console MUST show the data layer's refusals (duplicate contact email, allowance below named plus-ones, linked staff account, duplicate guest name) as clear messages without losing the user's input.
- **FR-008**: Staff MUST be able to see the delivery-problem flag on households and filter the list by it.
- **FR-009**: Staff MUST be able to view possible duplicate households, with links to each; the console MUST NOT merge automatically.
- **FR-010**: Staff MUST be able to import a guest list from a CSV or Excel (.xlsx) file and see created counts and per-row errors (row, field, message), with whole-file errors shown separately. Both formats MUST use the same columns and give the same results for the same data. For an Excel file with several sheets, the console MUST say which sheet was read.

**Events, invitations, RSVPs**

- **FR-011**: Staff MUST be able to create, edit and delete events with name, date and time, venue, required/optional, group, deadline and display order.
- **FR-012**: Staff MUST be able to invite selected guests to an event, including after initial invitations, and remove an invitation.
- **FR-013**: Staff MUST be able to record or change a household's RSVP and meal choices on its behalf, regardless of deadline or the RSVPs-open setting.
- **FR-013a**: Every RSVP and meal choice MUST record who gave it: the guest or a named staff member. The console MUST show this wherever an answer is shown (household detail, invitation lists, reports where practical, and all history pages), so an answer a staff member recorded can never be mistaken for one the guest gave. The console MUST NOT offer any way to record an answer on a household's behalf that bypasses this record.

**Menus and dietary**

- **FR-014**: Staff MUST be able to manage each event's menu status (draft, published, closed), courses (name, order, whether a choice is required) and dishes (name, description).
- **FR-015**: Staff MUST be able to manage dietary categories and tag dishes with them, with diet and allergen kinds shown distinctly.
- **FR-016**: Staff MUST be able to archive a dish and see the affected guests.
- **FR-017**: Staff MUST be able to record guests' dietary categories, severity and details.

**Campaigns**

- **FR-018**: Staff MUST be able to create and edit campaigns while draft or scheduled, with a message type, audience (all, one household, or filters) and optional schedule.
- **FR-019**: Staff MUST be able to preview an audience before saving or sending, with undeliverable households and their reasons listed.
- **FR-020**: Staff MUST be able to send a draft or scheduled campaign now, after confirmation, and cancel a draft or scheduled campaign.
- **FR-021**: The console MUST show campaign status and per-household delivery status, and treat sending and finished campaigns as read-only.
- **FR-022**: The console MUST show a campaign's last error (such as a missing template) in plain language.

**Reports, exports, history**

- **FR-023**: Staff MUST be able to view dish totals, the dietary list, and meal conflicts, filterable by event.
- **FR-024**: Staff MUST be able to download the guest, response and caterer CSV exports.
- **FR-025**: Staff MUST be able to read the audit log, RSVP history and meal selection history, filterable by date and by who made the change.

**Settings and staff**

- **FR-026**: Staff MUST be able to view and change the default RSVP deadline and the RSVPs-open switch.
- **FR-027**: The couple MUST be able to list staff, grant planner access and revoke access; the console MUST show the "last couple member" refusal.

**Cross-cutting**

- **FR-028**: Every create, update, delete, send and import action MUST show a success or failure result, and destructive actions MUST require confirmation.
- **FR-029**: The console MUST use only plain, unstyled page elements: no branding, theming, design system or imagery. Presentation MUST be separable from behavior so a later design can replace it without changing what each page does.
- **FR-030**: The console MUST build on the existing admin API and staff data access, and MUST NOT weaken access rules to work around a gap. Gaps it finds MUST be recorded as notes. The one planned exception is reading Excel files in the guest-list import (FR-010), because the existing import accepts CSV only; the plan must say where that conversion happens and keep the same validation and per-row errors as CSV.
- **FR-031**: The console MUST NOT log or display guest personal data beyond what staff need on the page, and MUST use fake data in all tests and fixtures.
- **FR-032**: The console MUST be usable on a laptop-width screen with keyboard only; mobile layout is not required.
- **FR-033**: The repository rules and handoff documents MUST be updated in the same change so they no longer contradict this feature: the Scope and Layout sections of `CLAUDE.md` (which currently forbid any screen and mark `src/components` unused), the "no user interface" notices in the admin API handoff document, and any matching statement in the architecture document. They MUST say that a minimal v0 admin console exists, is temporary, is separate from the designer's work, and that guest-facing screens and email content remain out of scope.

### Key Entities

- **Household**: the unit of invitation and email; has contact email (optional), address, plus-one allowance, deadline override, reminders opt-out, delivery-problem flag, staff notes and a message to the couple.
- **Guest**: a person in a household (or an unnamed plus-one seat) with dietary notes and staff notes.
- **Event**: a named occasion, required or optional, with date, venue, group, deadline and order.
- **Invitation / RSVP**: one guest's invitation to one event, with status pending, attending or declined, and a record of who answered (the guest or a named staff member) and when.
- **Menu, Course, Dish, Dietary category, Dish tag**: what is served at an event and what each dish suits or contains.
- **Guest dietary entry and Meal selection**: a guest's restrictions and chosen dish per course.
- **Campaign, Message**: a planned send to an audience, and the per-household outcome of it.
- **Settings**: default deadline and RSVPs-open switch.
- **Staff member**: a couple or planner account.
- **History records**: audit log (fields changed, never values), RSVP history, meal selection history.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every capability in the admin API handoff document can be exercised from the console without scripts or the database dashboard, verified by a checklist walk-through with zero capabilities missing.
- **SC-002**: A staff member can sign in and reach the overview in under 1 minute from requesting the link, excluding email delivery time.
- **SC-003**: A staff member can create a household with two guests in under 2 minutes on first use.
- **SC-004**: A CSV file and an Excel file of 200 households each import with all valid rows created and each bad row reported with row, field and message, with identical results for identical data.
- **SC-010**: For every RSVP and meal choice in a test set mixing guest-given and staff-recorded answers, the console shows the correct source (guest or named staff member) on 100% of them.
- **SC-005**: A staff member can build a campaign, preview its audience and send it in under 3 minutes on first use.
- **SC-006**: 100% of API or data-layer error cases listed in the admin API handoff document appear in the console as a readable message, with no raw or internal text.
- **SC-007**: 0 pages are viewable by a signed-out visitor or a guest account.
- **SC-008**: Replacing the visual presentation of all pages is possible without changing the behavior tests, demonstrated by the behavior tests passing when presentation is swapped for a different one.
- **SC-009**: The team finishes an end-to-end rehearsal (import, invite, answer, send, report, export) and records any API or data-model gaps found.

## Assumptions

- The two admin interfaces described in the admin API handoff document are used as they are; this feature adds no new data-layer capability beyond reading Excel files in the import (FR-010, FR-030). Gaps found are recorded for a follow-up change.
- Staff are the couple (Chris, Hannah) and one planner; the console is for desktop use and does not need a mobile layout.
- The console lives at the `/admin` path, served from the same site as the API, as the handoff document assumes.
- Email content stays out of scope: campaign sending is exercised using whatever templates are registered, and a missing template is shown as an error.
- The creative director's design will replace the presentation later; no part of this feature's look is meant to be kept.
- Guest-facing screens (public site, RSVP) remain out of scope.
- Real guest data is not used in testing; fixtures and seeds are fake.
- Accessibility is basic: standard page structure and labelled form fields, keyboard use and no reliance on color alone; a full accessibility review waits for the real design.
- The wedding is in California, so every date and time in the console (event times, RSVP deadlines, scheduled sends, history timestamps) is shown and entered in Pacific time (America/Los_Angeles), with the zone named next to each time and daylight saving handled. This holds even though the couple and planner may be using the console from another zone (for example Washington, DC), so a 4:00 PM ceremony is entered as 4:00 PM Pacific. The zone is one configured value used everywhere, not a per-event choice.
