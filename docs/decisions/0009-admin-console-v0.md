# 0009: Admin console v0

Status: accepted (the couple confirmed on 2026-10-25)

This repository now builds a minimal, deliberately plain admin console for
Chris, Hannah and their planner. It supersedes the earlier "backend only, build
no screens" rule for **admin screens only**. Guest-facing screens (the public
site and the RSVP) and email content remain out of scope. The console is
temporary: the creative director's version replaces it. The full plan is in
[`specs/002-admin-console-v0`](../../specs/002-admin-console-v0/plan.md).

## Decisions

- **Route group with its own root layout.** Admin pages live in
  `src/app/(admin)/` with their own `<html>` layout and stylesheet. No
  `src/app/layout.tsx` is added, so nothing is imposed on the designer's public
  site (research R1, the page structure decision).
- **One plain stylesheet instead of Tailwind utilities.** Colors, type and
  spacing are CSS variables at the top of `src/app/(admin)/admin.css`, and
  components use semantic class names (`.card`, `.badge`, `.btn`). Why: the look
  is throwaway, and replacing one file (or just its variables) must restyle the
  console without touching markup or behavior tests. Tailwind utility classes
  would spread styling through every component. Tailwind stays installed for the
  designer's site. This is a departure from the Tailwind entry in the stack list
  (research R5, the styling decision).
- **Thin pages, logic tested with Jest, no end-to-end framework in v0.** An async
  page loads data through a function in `src/lib/admin` and passes plain props to
  synchronous components in `src/components/admin`. Components, data functions,
  Server Actions and helpers are tested with Jest and React Testing Library. Async
  pages are not covered by Jest (Next.js says Jest does not support async Server
  Components), and a browser test framework would need the local database in CI,
  so v0 relies on a written walkthrough instead (research R10, the testing
  decision).
- **Reads in Server Components, direct writes in Server Actions, secret-key
  operations stay in the existing route handlers.** Reads and writes under
  row-level security run as the signed-in staff member, never with the
  service-role key. The seven operations that need the server secret keep using
  the existing typed wrappers in `src/lib/admin-api/client.ts` rather than being
  duplicated (research R3, the reads and writes decision; and R2 and R4, which
  put the session check close to the data and keep tabs and confirmations as URL
  values).

## Consequences

- `CLAUDE.md` and `docs/architecture.md` are updated to allow admin screens only.
- The couple confirmed this decision, so its status is accepted.
