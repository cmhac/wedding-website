# Research: Admin setup guide (technical decisions)

Design-side research (what makes a good setup guide, with sources) is in [design-research.md](./design-research.md). This file records the technical choices.

## T1. The step catalogue is code, the status is computed

**Decision**: one pure module (`src/lib/setup/steps.ts`) lists every step: key, label, purpose, "if unset" text, group (required or recommended), kind (`console`, `outside`, `manual`), and which role may change it. A second module (`status.ts`) takes plain inputs (the settings row, the presence of each environment value, the texting state, the manual confirmations) and returns done or open with a reason per step. A thin server loader gathers the inputs and calls it.

**Rationale**: the spec says status is never stored and must not disagree with the site. A pure function is tested exhaustively with no I/O; the loader is tested with fakes.

**Alternatives**: store a "completed" flag per step (rejected: drifts, the spec forbids it); one check function per step spread across features (rejected: the readiness list for the save the date already does that for sending and would be duplicated; the guide reuses its facts where they overlap, see T6).

## T2. Where per-person state lives

**Decision**: a new table `setup_guide_state`, one row per staff member (primary key is the user id), holding `skipped_steps text[]`, `last_step text`, `left_guide boolean`, `seen_required text[]` and `updated_at`. Row-level security lets a staff member read, insert and update only their own row. A second table `setup_confirmations` (`step_key`, `confirmed_by`, `confirmed_at`) holds shared confirm-by-hand marks; any staff member may read, insert and delete.

**Rationale**: the clarification chose server-side, per-person state. Two small tables keep personal interface state apart from shared facts. `seen_required` records which required steps existed when the person left the guide, so a newly added required step is noticed without a version counter.

**Alternatives**: browser storage (rejected: does not follow the person, cleared silently); a JSON column on `staff` (rejected: widens a table whose grants are deliberately narrow).

## T3. How the banner learns the state without a flash

**Decision**: the console layout (a server component) loads status and the person's guide state together and passes them to one client component that draws the banner, the compact reminder, the nav count and the guide panel. Open or closed is client state, initialised from a `?setup` search parameter so a link can open it and a refresh keeps it.

**Rationale**: the layout already runs per request and already renders the texting banner, so no extra round trip and no first-paint flash. Layouts cannot read search parameters, so the client component reads them.

**Alternatives**: fetch status from an API route on the client (rejected: flash, and the spec forbids it); one page per step (rejected: loses the panel feel).

## T4. Steps set in the console reuse the existing actions

**Decision**: the wedding event, RSVP, place line and similar steps render the same form fields and call the same server actions as Settings (`saveSettings` and the details action), then revalidate the layout so status recomputes. New actions cover only guide state: leave, resume, restart, skip, confirm by hand, unconfirm.

**Rationale**: one validation path; the guide cannot accept a value Settings would refuse.

## T5. Steps set outside the console

**Decision**: status for hosting values is presence only (non-empty, and for the site address a well-formed web address). The page never receives or logs a value; `status.ts` takes booleans, not strings, for secrets. "Check again" is a server action that revalidates and returns the fresh status.

**Rationale**: spec FR-009 and FR-029. Hosting changes need a redeploy before the running site sees them; the panel says so.

## T6. Relationship to the save the date readiness list

**Decision**: keep both. The readiness list answers "can this send go out" and stays on the send screen; the guide answers "is the site set up". They share one source of truth for the facts they overlap on (wedding date, site address, email key) by both calling small helpers in `src/lib/setup/facts.ts`, so they cannot disagree.

**Alternative**: replace the readiness list with the guide (rejected: the list is per send and also covers sender channel choice).

## T7. Accessibility

**Decision**: the panel is a native `<dialog>` opened with `showModal()`: it names itself with `aria-labelledby`, moves focus in, closes on Escape, returns focus to the opener, and the browser prevents focus escaping into the page behind while open. The banner is `role="status"` (polite). Step changes announce through a visually hidden live region.

**Rationale**: the native element gives the common requirements free, which design-research.md found is the usual advice. Escape and the close button always work, so there is no keyboard trap.

## T8. Failure and performance

**Decision**: the loader runs in the layout inside a try/catch; on any error it logs the failing read's name through `src/lib/log.ts` (never data) and renders no banner. It makes one settings read, one guide-state read and one confirmations read in parallel, plus environment checks (no I/O).

**Rationale**: spec FR-028 and the 100 ms budget.

## T9. Types

**Decision**: new tables are reached through loose typing until `npm run db:types` is run on a machine with Docker (same as the save the date feature); the plan records it in Complexity Tracking.
