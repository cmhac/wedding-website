# Feature Specification: Placeholder homepage

**Feature Branch**: `004-placeholder-homepage`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Placeholder homepage at "/" (currently 404s on hannahandchris.wedding) to demonstrate that production deployments work, using the real sign-in flows. If the visitor is not signed in, prompt them to sign in and go through the normal auth flow. If signed in (including admins signed in to the admin panel, who must also get access to the guest-facing site), show an empty page with a system-theme-aware light/dark toggle and a single line of text, in a basic sans-serif font, centered vertically and horizontally, reading "Coming soon 👀". Temporary placeholder; not the designer's guest-facing frontend."

## Clarifications

### Session 2026-11-09

- Q: After a couple or planner member signs in from the prompt at `/` using their staff email link, which page do they land on? → A: The admin console, as staff sign-in works today. The admin console gets a button at the very top of its sidebar, visible to staff only, that opens the home page in a new browser tab.
- Q: Should the placeholder page give a signed-in guest or staff member a way to sign out? → A: Yes, for now: a small "Sign out" text link next to the theme toggle. The admin console already has its own sign-out button, which is unchanged.

## Background

Today the site's front door, `hannahandchris.wedding/`, answers "not found". The sign-in flows (guest personal links, guest typed-address links, and staff sign-in) all work behind the scenes, but there is no public page that shows them working, and a signed-in guest is sent to the RSVP page, which has not been built.

This feature adds one deliberately minimal, **temporary** page at the site's front door. Its job is to let the couple show that production is live and that the real sign-in flows work end to end. The designer's guest-facing site replaces it later, so it carries no visual design beyond what is described here.

Plain-language terms used below:

- **Placeholder page**: the signed-in view, an otherwise empty page with the line "Coming soon 👀" and a theme toggle.
- **Sign-in prompt**: what a visitor who is not signed in sees at the same address.
- **Signed in**: holding a valid session as a guest (a household) or as staff (couple or planner). Both count equally.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Signed-in person sees the placeholder (Priority: P1)

A guest who has opened their personal invite link or a typed-address sign-in link, or a couple or planner member who has signed in to the admin console, opens the site's front door and sees a calm, empty page: one line, "Coming soon 👀", centered in the window, with a light/dark toggle.

**Why this priority**: this is the demonstration the couple want to show, and it proves that deployment, sign-in and sessions work in production.

**Independent Test**: sign in as a household and, separately, as staff; open `/` in each; confirm the placeholder page appears in both cases.

**Acceptance Scenarios**:

1. **Given** a guest signed in through a personal invite link, **When** they open `/`, **Then** they see the placeholder page.
2. **Given** a guest signed in through a typed-address sign-in link, **When** they open `/`, **Then** they see the placeholder page.
3. **Given** a couple or planner member signed in to the admin console, **When** they open `/` without signing in again, **Then** they see the placeholder page.
4. **Given** the placeholder page is open, **Then** the only content is the line "Coming soon 👀", the theme toggle and a small "Sign out" link: no header, navigation, footer, images or other text.
5. **Given** the placeholder page is open at any window size, **Then** the line is centered both vertically and horizontally and shown in a plain sans-serif font.
6. **Given** the placeholder page is open, **When** the person presses "Sign out", **Then** they are signed out on that device and see the sign-in prompt, and the prompt works again for a fresh demo.

---

### User Story 2 - Visitor who is not signed in is prompted to sign in (Priority: P1)

A visitor who is not signed in opens `/` and is prompted to sign in. They go through the normal flow: type an email address, receive the sign-in email, open its link, and arrive at the placeholder page signed in. A couple or planner member uses the same prompt with their staff email address, is signed in through the staff process, and lands on the admin console, with no separate staff link to find.

**Why this priority**: without it the placeholder cannot demonstrate the real sign-in flows, which is the point of the feature.

**Independent Test**: in a fresh browser with no session, open `/`, request a sign-in link for a household's email address, open the link from the email, and end up on the placeholder page.

**Acceptance Scenarios**:

1. **Given** a visitor with no session, **When** they open `/`, **Then** they see a sign-in prompt and not the placeholder page and not a "not found" page.
2. **Given** the sign-in prompt, **When** the visitor submits an email address, **Then** they are shown the same neutral message whether or not the address is on the guest list ("If that address is on the guest list, a link is on its way."), so the page never reveals who is invited.
3. **Given** a household's email address was submitted, **When** the visitor opens the emailed link, **Then** they are signed in and land on the placeholder page.
4. **Given** a visitor with no session who opens a household's personal invite link, **When** the link is valid, **Then** they are signed in and land on the placeholder page.
5. **Given** the sign-in prompt, **When** someone submits the email address of a couple or planner account, **Then** they are shown the same neutral message and receive the staff sign-in email (not a guest one); opening it signs them in as staff and takes them to the admin console, from where they can open `/` and see the placeholder page.
6. **Given** the sign-in prompt, **When** the visitor submits the address of a staff account and, separately, one that is on neither list, **Then** the message shown and the time taken to show it look the same, so the page never reveals who is staff.
7. **Given** an invalid, cancelled or expired link, **When** a visitor opens it, **Then** they see the existing plain sign-in failure page, and can get back to the sign-in prompt from there.

---

### User Story 3 - Light/dark toggle follows the system and can be overridden (Priority: P2)

On the placeholder page, the page starts in whichever theme the visitor's device is set to (light or dark). A toggle lets them switch, and the page remembers their choice on that device.

**Why this priority**: it is part of what the couple want to show, but the page is useful without it.

**Independent Test**: open the placeholder page with the device set to dark, see dark; press the toggle, see light; reload, still light.

**Acceptance Scenarios**:

1. **Given** a device set to dark and no saved choice, **When** the placeholder page opens, **Then** it is dark; with the device set to light, it is light.
2. **Given** the placeholder page, **When** the visitor presses the toggle, **Then** the theme switches at once and the toggle indicates the current theme.
3. **Given** the visitor has pressed the toggle, **When** they reload or return later on the same device, **Then** their choice is kept, including over a device-theme change.
4. **Given** the visitor can operate only a keyboard or screen reader, **When** they use the toggle, **Then** it is reachable by keyboard and has an accessible name and state.
5. **Given** a saved choice that cannot be read (for example, browser storage is blocked), **When** the page opens, **Then** it follows the device theme and the toggle still works for the current visit.

---

---

### User Story 4 - Staff open the home page from the admin console (Priority: P2)

A couple or planner member in the admin console sees a button at the very top of the sidebar that opens the home page (`/`) in a new browser tab, so they can check what guests see without leaving the console.

**Why this priority**: it makes the staff view of the placeholder one click away, but the placeholder works without it.

**Independent Test**: sign in as staff, press the button, and confirm the home page opens in a new tab showing the placeholder page while the console stays open.

**Acceptance Scenarios**:

1. **Given** a signed-in couple or planner member on any admin console page, **When** they look at the sidebar, **Then** the first item at the top is a button labelled for the home page.
2. **Given** that button, **When** they press it, **Then** the home page opens in a new tab and shows the placeholder page, and the console page stays as it was.
3. **Given** the admin console's sign-in page or error page (no sidebar), **Then** no such button is shown.
4. **Given** a guest session, **When** the visitor looks for the button, **Then** it does not exist for them (guests cannot open the admin console).

---

### Edge Cases

- A guest signed in on the page, then signed out (guest sign-out exists): reloading `/` shows the sign-in prompt.
- A staff session that has expired: the visitor is treated as signed out and sees the sign-in prompt, not an error.
- A person signed in as staff but with a role that no longer has access (for example, staff revoked): treated as signed out for the placeholder page.
- The theme must not flash the wrong theme before the saved or device theme is applied on first paint.
- The sign-in prompt follows the device theme, so a dark-mode visitor is not met with a bright white page.
- JavaScript disabled: the placeholder line and the sign-in prompt still show; only the toggle may be unavailable.
- Very small windows, very large windows and landscape phones: the line stays centered and never clipped or overlapped by the toggle.
- Search engines: the page makes no claims and is not meant to be indexed while it is a placeholder. [see Assumptions]

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The site's front door (`/`) MUST return a normal page, not "not found", for every visitor.
- **FR-002**: A visitor with a valid guest or staff session MUST see the placeholder page at `/`.
- **FR-003**: Staff sessions (couple and planner) MUST be accepted at `/` with no separate guest sign-in; being signed in to the admin console is enough.
- **FR-004**: A visitor without a valid session MUST see a sign-in prompt at `/` and MUST NOT see the placeholder page.
- **FR-005**: The sign-in prompt MUST let a visitor submit an email address and MUST show one neutral confirmation message whatever address is typed, with no hint of whether the address is on the guest list or belongs to staff. The message MUST cover both cases (for example, "If that address is on the guest list or belongs to a staff account, a link is on its way.").
- **FR-005a**: When the address belongs to a household, the visitor MUST be sent the existing guest sign-in link. When it belongs to a couple or planner account, the visitor MUST be sent the existing staff sign-in link instead, which signs them in through the staff process. When it is neither, nothing is sent. The three cases MUST be indistinguishable to the visitor in message, response and response time.
- **FR-006**: After opening an emailed sign-in link or a personal invite link, a guest MUST end up on the placeholder page (not a "not found" page) with a valid session.
- **FR-007**: The sign-in prompt MUST NOT need a separate staff sign-in link or screen to be reached. The existing admin sign-in page keeps working at its own address.
- **FR-008**: The placeholder page MUST contain exactly one line of body text, "Coming soon 👀", one theme toggle and one small "Sign out" link, and nothing else visible. The toggle and sign-out link MUST sit apart from the centered line (for example, in a corner) and never overlap it.
- **FR-008a**: Pressing "Sign out" MUST end the person's session on that device, for a guest or staff session alike, and show the sign-in prompt. It MUST NOT sign them out on other devices.
- **FR-009**: The line of text MUST be centered vertically and horizontally in the visible window, in a basic sans-serif font.
- **FR-010**: The placeholder page MUST start in the device's light or dark setting when the visitor has made no choice.
- **FR-011**: The toggle MUST switch between light and dark, MUST remember the visitor's choice on that device, and MUST be operable by keyboard with an accessible name and state.
- **FR-012**: The page MUST apply the correct theme on first paint, with no visible flash of the other theme.
- **FR-013**: The sign-in prompt MUST follow the device's light or dark setting.
- **FR-014**: The page MUST NOT reveal anything about households, guests, staff or settings to a visitor who is not signed in.
- **FR-015**: Signing out, an expired session or a revoked staff role MUST return the visitor to the sign-in prompt at `/`, not to an error.
- **FR-016**: The feature MUST be marked temporary in the repository's documents, so the designer's guest-facing site is understood to replace the page, and it MUST add no design system, theming library or component library.
- **FR-017**: The page MUST NOT be offered to search engines for indexing while it is a placeholder.
- **FR-018**: Apart from the sidebar button in FR-020, the existing admin console, guest API, and sign-in flows MUST keep working unchanged.
- **FR-019**: After a staff member signs in from the prompt at `/`, they MUST land on the admin console, the same page as when they sign in from the admin sign-in page.
- **FR-020**: The admin console's sidebar MUST show, as its first item at the very top, a button that opens the home page (`/`) in a new browser tab. It MUST be shown to staff only, and MUST open without a second sign-in.

### Key Entities

- **Session**: the existing proof that a visitor is signed in, as a household (guest) or as staff. This feature only reads it; it does not create, change or store anything about sessions.
- **Theme choice**: the visitor's saved light/dark preference, kept on their own device only. It is not stored on the server and is not linked to a person or household.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Opening the site's front door never produces "not found"; it shows either the placeholder page or the sign-in prompt in 100% of checks.
- **SC-002**: A person with a household's email address can go from the sign-in prompt to the placeholder page signed in, in under 2 minutes, with no account creation or password.
- **SC-003**: A couple or planner member already signed in to the admin console sees the placeholder page at `/` on the first try, with no second sign-in, in 100% of checks.
- **SC-004**: In every check that uses an address on neither list, the message shown and the response time are indistinguishable from those for a household address and for a staff address.
- **SC-004a**: A couple or planner member can go from the sign-in prompt to the admin console signed in, using only their staff email address, with no other page visited, in under 2 minutes.
- **SC-004b**: From any admin console page with a sidebar, a staff member reaches the placeholder page in one press, in a new tab, in 100% of checks.
- **SC-005**: The placeholder page contains one line of text and two small controls (the toggle and "Sign out"); the line stays centered within 1% of the window's center at phone, tablet and desktop sizes.
- **SC-006**: In light and dark device settings, the page loads with no visible flash of the wrong theme, and text meets standard accessible contrast in both themes.
- **SC-007**: The couple can use this page, unaided, to show family or the designer that the production deployment and the real sign-in flows work.

## Assumptions

- **Scope exception.** The project rules say guest-facing screens are out of scope and belong to the designer. The couple's request for this placeholder (2026-11-09) is an explicit, narrow exception for one temporary page and its sign-in prompt: no visual design, no design system, no component library, and the designer's site replaces it. The project's scope notes should record this exception when the plan is written.
- **Sign-in prompt contents.** An email field, a submit button, and the neutral confirmation message. There is no separate staff link (changed 2026-11-09 at the couple's request): staff are recognized by the address they type.
- **Address on both lists.** If one address is both a staff account and a household contact (for example, a couple member who is also on the guest list), the staff link is sent. Staff can already see the placeholder page, and a household's personal invite link still reaches the guest side.
- **Staff status is looked up on the server.** The visitor's browser learns nothing about staff status; the same limits on attempts per address and per visitor that guest sign-in has apply to the whole prompt, so the prompt cannot be used to probe for staff addresses. Wording is plain first-draft text for the couple to polish. Text messages are not part of the sign-in (they are deferred to a later feature).
- **Where signed-in guests land.** The guest sign-in routes currently send guests to `/rsvp`, which is not built. Until the designer's RSVP exists, this feature makes those landings reach the placeholder page instead. Changing where the sign-in routes redirect to is therefore in scope; when the RSVP page is built it will take that back.
- **Sign-out.** Added at the couple's request (2026-11-09) so a demo can be repeated; it is a plain text link, and the designer's site decides whether guests keep it. Signing out here does not change the admin console's own sign-out.
- **Theme.** The saved choice is a per-device convenience only; with nothing saved, the device's light/dark setting applies. The toggle is on the placeholder page; the sign-in prompt follows the device setting without a toggle.
- **Search engines.** The placeholder is marked as not to be indexed; this is revisited when the real homepage replaces it.
- **Admin console change.** The sidebar button changes the existing admin console, which stays temporary and plain; it uses the console's one stylesheet and adds no design system.
- **Staff access.** "Signed in to the admin panel" means a current couple or planner session; a guest session does not grant admin access, and the placeholder page grants nothing beyond the placeholder.
- **Font.** "Basic sans-serif" means the device's standard sans-serif font; no web font is downloaded.
- **Emoji.** The 👀 emoji is rendered by the device's own emoji font.
- **Dependencies.** Relies on the existing guest sign-in, personal invite links, sign-out and staff sign-in, which already work. No new data is stored, so no database change is expected.
