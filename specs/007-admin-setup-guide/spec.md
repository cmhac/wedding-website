# Feature Specification: Admin setup guide

**Feature Branch**: `007-admin-setup-guide`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "A smoother onboarding process for admins. If any required values are not set, a warning banner is displayed at the top of the page which prompts you to set them up and guides you interactively through each step. Users can escape this setup mode if they wish, and also restart it and resume their progress."

Design research behind this spec, with sources: [design-research.md](./design-research.md).

## Overview

Today the admin console tells staff about missing setup in scattered places: one banner when texting is not set up, a warning on the overview when no wedding event is chosen, and a long setup document ([docs/manual-setup.md](../../docs/manual-setup.md)) that the couple must read separately. A new staff member cannot tell what is left to do before the site can send its first message.

This feature adds one **setup guide**: a single list of what must be set, shown as a banner on every admin page while anything required is missing, which opens an interactive walk through the steps. The guide only ever reads the real state of the site, so it cannot disagree with it. Leaving the guide is always allowed, and a small reminder keeps the way back in sight until setup is done.

## Clarifications

### Session 2026-11-12

- Q: Which steps are required (they raise the banner) and which are only recommended? → A: Required: site address, wedding event, email sending (the key and the from address), the personal-link key, and the scheduled-sending key. Recommended: place line and note for the card, default RSVP deadline, close the RSVP until invitations go out, texting, email delivery tracking (the provider's webhook signing key), and, as "confirm by hand", the sending domain verified at the email provider.
- Q: Who may change each step's value? → A: Every staff member (couple and planner) may change every console-settable step, matching the existing Settings page, except the texting switch, which only the couple may change. A planner sees that step read-only with "Only the couple can change this" and may skip it.
- Q: Where is a person's guide state kept? → A: On the server, one record per staff member that only that member can read or change. Confirm-by-hand marks are one shared record per step. Neither is ever used to decide whether a value is set.
- Q: What does leaving the guide do to the banner? → A: Closing the guide by any route (close button, Escape, "Not now") leaves the compact reminder in place of the full banner, for that person, until they restart setup or a new required step appears, which brings the full banner back. Only finishing the required steps removes the reminder.
- Q: When is the status worked out, and what happens if it cannot be? → A: Fresh on every admin page load and on every "Check again" (no cached copy). If it cannot be worked out, the page renders without any banner, and the failure is logged without personal or secret data.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See what is missing and be led through it (Priority: P1)

A couple member or the planner opens any admin page on a site where required setup is missing. A banner at the top says how much is left ("Setup is not finished: 2 of 5 required steps left") and offers "Start setup". Choosing it opens the guide at the first unfinished step. Each step says in plain words what the value is for, what to do, and gives the control to do it right there (or, for values that live outside the console, the exact steps and a "Check again" button). When the step's value is set, the step is marked done on its own and the guide moves to the next unfinished step. When every required step is done, the guide says so and the banner disappears.

**Why this priority**: this is the whole point of the feature. Without it nothing else matters, and with only this, a new admin can already finish setup.

**Independent Test**: on a site with a required value missing, load any admin page and see the banner; start the guide; complete each step; see each step mark itself done and the banner disappear after the last required one.

**Acceptance Scenarios**:

1. **Given** a required value is not set, **When** a signed-in staff member opens any admin page, **Then** a warning banner is at the top of the page showing how many required steps are done and a button that starts the guide.
2. **Given** the guide is open on a step whose value can be set in the console, **When** the staff member saves a valid value, **Then** the step shows as done without any further click and the guide offers the next unfinished step.
3. **Given** the guide is open on a step whose value is set outside the console (for example at the hosting or email provider), **When** the staff member follows the shown instructions and chooses "Check again", **Then** the step is marked done if the value is now present and otherwise stays open with a plain reason.
4. **Given** the last required step is finished, **When** the guide updates, **Then** it shows a short "Setup complete" message, lists any recommended steps still open, and the warning banner is gone from every page.
5. **Given** no required value is missing, **When** a staff member opens any admin page, **Then** no setup banner appears.

---

### User Story 2 - Leave the guide and come back (Priority: P1)

A staff member who does not want to do setup right now can leave at any time: close the guide, skip a single step, or stop the guide altogether. Nothing they have entered is lost and nothing in the console is blocked. A smaller reminder stays at the top ("Setup paused: 3 of 5 required steps done. Resume setup") so the way back is always visible. "Resume setup" opens the guide at the step they left on, or at the first unfinished step if that one is now done.

**Why this priority**: the user asked for it directly, and a guide that cannot be escaped would get in the way of staff doing their ordinary work.

**Independent Test**: start the guide, finish one step, close the guide midway through the next, sign out and in again on another device, and confirm the reminder shows the right progress and "Resume setup" returns to the unfinished step.

**Acceptance Scenarios**:

1. **Given** the guide is open, **When** the staff member closes it by the close button, the Escape key, or "Not now", **Then** the page they were on is unchanged, any value already saved stays saved, and the compact reminder is shown.
2. **Given** a step is open, **When** the staff member chooses "Skip this step", **Then** the step is marked skipped (not done), the guide moves on, and the skipped step is still counted as missing in the progress line.
3. **Given** the staff member left the guide on a step, **When** they later choose "Resume setup", **Then** the guide opens on that step, or on the next unfinished one if that step has since been finished.
4. **Given** the staff member left the guide, **When** they sign in again, on the same device or a different one, **Then** the compact reminder shows the same progress and skipped steps.
5. **Given** the staff member left the guide, **When** any admin page opens, **Then** only the compact reminder appears (never nothing, while a required value is missing), until they restart setup or a new required step appears.

---

### User Story 3 - Restart the guide (Priority: P2)

A staff member who skipped steps, or who wants to review settings, can restart the guide from the compact reminder or from a standing "Setup guide" link in the console's navigation (visible even when setup is complete). Restarting clears skips and position for that person and opens the guide at the first step. Steps whose values are already set show as done; the guide never asks for a finished value again unless the person chooses to change it.

**Why this priority**: it makes the guide recoverable, but staff can already finish setup without it.

**Independent Test**: skip two steps, restart, and confirm both reappear as open while finished steps stay done and the guide opens at the first open step.

**Acceptance Scenarios**:

1. **Given** setup is complete, **When** a staff member opens the standing "Setup guide" link, **Then** the guide opens showing every step done, each with a "Change" control, and with no banner anywhere.
2. **Given** some steps were skipped, **When** the staff member chooses "Restart setup", **Then** the skipped marks and the remembered position are cleared and the guide opens on the first unfinished step.
3. **Given** a value that was set earlier is later removed (for example the wedding event is deleted), **When** any admin page opens, **Then** the banner returns and that step shows as open again.

---

### User Story 4 - Recommended steps do not nag (Priority: P3)

Some setup is useful but not needed for the site to work (for example the place line on the save the date card, or texting). The guide lists these in a separate "Recommended" group after the required ones. They appear in the guide but never in the banner: the banner is about required values only.

**Why this priority**: it keeps the warning meaningful. Warning on everything teaches staff to ignore it.

**Independent Test**: with all required values set and a recommended one missing, confirm there is no banner, the standing link opens the guide, and the recommended step shows as open there.

**Acceptance Scenarios**:

1. **Given** every required value is set and a recommended one is not, **When** an admin page opens, **Then** no banner appears and the standing guide link shows a small "1 recommended" count.
2. **Given** the guide is complete for required steps, **When** it shows the recommended group, **Then** the staff member can do or skip each recommended step without any warning being raised.

---

### Edge Cases

- Two staff members work through the guide at once and one finishes a step the other has open: the other's screen shows it as done the next time it checks, and saving the same value twice is harmless.
- A value is set but invalid or unusable (for example a site address that is not a full web address): the step stays open and says what is wrong, rather than counting as done.
- A value can only be set outside the console and the site has not yet picked up the change (hosting changes may need a redeploy): "Check again" says so plainly rather than only "not set".
- The planner opens the guide and a step can only be changed by the couple: the step is shown with who can change it and cannot be saved by the planner; the planner can skip it or leave a note for the couple's attention (see Assumptions).
- A staff member is signed out partway through a step: the unsaved form entries are lost as in any admin form, but the guide position and skips already saved are kept.
- The setup list changes after a release (a new required step appears): the banner returns for everyone, the progress line counts the new step, and earlier skips do not hide it.
- Everything is set: the banner never flashes on page load while the check runs.
- A staff member with a very narrow screen: the banner and the guide stay usable without sideways scrolling.

## Requirements _(mandatory)_

### Functional Requirements

**The banner**

- **FR-001**: While any required step is not done, every admin console page MUST show a warning banner at the top of the page, below the page header and above the page content.
- **FR-002**: The banner MUST show how many required steps are done out of the total (for example "3 of 5") and a button that opens the guide.
- **FR-003**: The banner MUST disappear on every page, for every staff member, when no required step is open, with no manual action.
- **FR-004**: The banner MUST NOT appear for recommended steps.
- **FR-005**: The existing separate banner about texting not being set up MUST be replaced by a recommended step in the guide, so the page never shows two setup banners.

**The guide**

- **FR-006**: The guide MUST present the steps one at a time, in a fixed order, with a visible list of all steps showing each as done, open or skipped, and the progress line.
- **FR-007**: Each step MUST say, in plain words, what the value is for and what happens if it stays unset.
- **FR-008**: A step whose value can be set in the console MUST let the staff member set it inside the guide, using the same validation as the existing setting.
- **FR-009**: A step whose value is set outside the console MUST show the exact steps to take (with the name of the value and where it goes) and a "Check again" control. It MUST NOT ask the staff member to type a secret into the console.
- **FR-010**: A step's done state MUST be worked out from the live state of the site each time it is shown. It MUST NOT be stored as something the staff member ticked.
- **FR-011**: When a step becomes done the guide MUST move to the next open step without another click, and MUST announce the change to screen readers.
- **FR-012**: The guide MUST include only steps the site can actually check. A step that cannot be checked (for example whether a sending domain is verified at the email provider) is shown as "confirm by hand" with the instructions and an "I've done this" control, and is never counted as a missing required value.

**Leaving, resuming, restarting**

- **FR-013**: Staff MUST be able to close the guide at any moment by a close button, the Escape key, or "Not now", without losing values already saved and without any page content being changed.
- **FR-014**: Staff MUST be able to skip any single step. A skipped step counts as not done in every progress line and in the banner.
- **FR-015**: While a required step is open, leaving the guide MUST leave a compact reminder in place of the full banner text, showing the progress and a "Resume setup" button. Nothing the staff member does short of finishing setup may remove the reminder.
- **FR-016**: "Resume setup" MUST open the guide at the step the staff member last viewed, or at the first open step if that step is done.
- **FR-017**: Each staff member's skipped steps, last position, and whether they have left the guide MUST be remembered per staff member, so they follow the person to another browser or device.
- **FR-018**: Staff MUST be able to restart the guide, which clears that person's skipped marks and position and opens the first open step. Restarting MUST NOT change any site value.
- **FR-019**: A standing "Setup guide" link in the console navigation MUST open the guide at any time, including when setup is complete, in which case each step is shown done with a "Change" control.

**Who can do what**

- **FR-020**: Every staff role (couple and planner) MUST see the banner and the guide. A step MUST show who may change its value and MUST NOT let a role save a value it may not change; the same rules as the existing Settings page apply.
- **FR-021**: One staff member's skips, position and left-the-guide state MUST NOT change what another staff member sees. Whether a step is done is the same for everyone.
- **FR-022**: Guests, signed-out visitors and non-staff accounts MUST NOT see the banner or the guide or be able to read or change guide state.

**Accessibility and layout**

- **FR-023**: The guide MUST be fully usable by keyboard. When it opens, focus moves into it. Escape closes it. When it closes, focus returns to the control that opened it. Focus MUST never be trapped.
- **FR-024**: The guide MUST have an accessible name, and the banner MUST be announced politely (not as an interruption) when it appears or its count changes.
- **FR-025**: The banner and guide MUST work at phone width without sideways scrolling, and in the console's light and dark appearance.
- **FR-026**: The page MUST NOT flash a banner and then remove it on first load when nothing is missing.

**Scope**

- **FR-027**: The guide MUST be built with the console's existing plain stylesheet and components (no design system, no new library), as the admin console is temporary and plain by design.
- **FR-028**: The guide MUST NOT block, delay or reorder any other console action, and a failure to read setup state MUST NOT break the page it appears on: the page renders, without the banner, and the failure is logged without any personal or secret data.
- **FR-029**: The guide MUST NOT show or log the value of any secret. For secrets it may show only whether they are present.

### Key Entities

- **Setup step**: one thing to set. Has a name, a plain-language purpose, whether it is required or recommended, who may change it, how it is set (in the console, or outside it with instructions), and a live status of done or open (never stored). The catalogue of steps is defined in the product, not entered by staff.
- **Setup status**: the live result of checking every step: for each, done or open, and a plain reason when open. Shared by everyone.
- **Guide state (per staff member)**: which steps this person skipped, which step they last viewed, and whether they have left the guide (so the compact reminder shows). Interface state only; never affects the status.
- **Confirmed-by-hand marks**: for steps the site cannot check, a record that a staff member confirmed it, with who and when. Shared by everyone, and cleared by restarting only for that person's own view, not for the site.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new staff member on a fresh site can finish every required step using only the guide, with no other document open, in under 10 minutes if the outside-the-console values are already at hand.
- **SC-002**: 100% of admin pages show the banner while any required step is open and 0% show it when none is open, checked across every console page.
- **SC-003**: Leaving the guide at any step loses no saved value, and reopening it returns to the right step in 100% of tested paths (close button, Escape, Not now, sign-out and sign-in, a different browser).
- **SC-004**: The guide's done/open status matches a direct check of the site's state in every tested case, including after a value is removed, because completion is never stored.
- **SC-005**: The guide can be completed, closed, resumed and restarted using only a keyboard, and passes an automated accessibility check with no serious or critical issues.
- **SC-006**: Adding the banner changes the load time of an admin page by no more than a barely noticeable amount (under 100 ms added on the page's server response, measured on the overview page).
- **SC-007**: No secret value, guest address or phone number appears in the page output, in logs, or in any stored guide state, checked by test.

## Assumptions

- **Who it is for**: the couple and the planner, the only staff roles. The guide is part of the temporary plain admin console, so it is deliberately plain and the creative director's version may replace it. This extends the console scope already granted; it adds no guest-facing screen.
- **What counts as required** (to be confirmed against the code in planning): the wedding event is chosen, the site's public address is set, the email sending key and from address are set, and the keys that personal invite links and scheduled sending depend on are present. **Recommended**: the place line and note on the save the date card, the default RSVP deadline, closing the RSVP until invitations go out, texting (replacing today's texting banner), and the sending-domain check at the email provider (confirm by hand). The catalogue lives in one place so it is easy to change.
- **Values set outside the console** (hosting environment values, the email provider's dashboard) cannot be saved from the guide. The guide shows the steps and checks for presence only. Hosting changes may need a redeploy before "Check again" sees them.
- **Per-person state is stored server-side** (confirmed in clarification), not in the browser, so a person's skips and position follow them between devices (see research). A skipped step is remembered, but it still counts as missing.
- **Leaving never removes the warning**: the user asked for the banner whenever required values are missing and for an escape from the guide, so leaving shrinks the banner to a compact reminder, and only finishing the required steps removes it. A staff member who finds even the compact reminder unwelcome can finish or confirm the steps; there is no "hide forever" while a required value is missing.
- **A role that cannot change a step** (if the existing Settings page restricts a setting to the couple) can skip it or open it read-only; leaving a note for the other role is out of scope for this version.
- **Where the first run starts**: the guide never opens by itself on top of the page; the banner invites and the staff member chooses. This avoids interrupting someone who came to do something else.
- **Dependency**: reuses the existing console shell, settings forms, session guard and staff roles, and the checks already behind the save the date readiness list. The readiness list for a single send stays as it is: it answers "can this send go out" and the guide answers "is the site set up". The two should not disagree on shared facts.
- **Out of scope**: changing guest-facing pages, email content, the designer's work, and any new dependency or design system. Tours that highlight parts of other pages, tooltips, analytics on guide use, and reminders by email are not included.
