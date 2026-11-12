# 0016: The admin setup guide

Status: accepted (the couple's request of 2026-11-12). Replaces the texting
banner of [0014](./0014-text-messages.md) with one setup guide. The full design
is in [`specs/007-admin-setup-guide`](../../specs/007-admin-setup-guide/plan.md).

## Decisions

- **One guide, one list.** A fixed list of steps (five required, six
  recommended) lives in code. A banner shows on every console page while a
  required step is open, and starts a guide that walks the steps. The earlier
  banner about texting is gone: texting is now a recommended step.
- **Done is worked out, never stored.** Each step's status is computed from the
  live site (the settings row, which hosting values are present, the texting
  state, and shared confirm-by-hand marks) on every page load. Nothing records
  "this step was completed", so the guide cannot disagree with the site.
- **Leaving never removes the warning.** Closing the guide shrinks the banner
  to a compact reminder with a way back. Only finishing the required steps
  removes it, and a required step added later brings the full banner back.
- **Per-person state lives on the server.** One row per staff member (their
  skipped steps, last step, and whether they left) that only they can read or
  change, so it follows them between devices. Two staff members never affect
  each other's view. Steps the site cannot check (the sending domain) use one
  shared confirm-by-hand mark.
- **No secret passes through the console.** Hosting values are checked for
  presence only. The guide shows their names and the steps to set them, and a
  "Check again" button; it never asks for, shows or logs a value.
- **Same rules as Settings.** Console steps save the same columns as the
  Settings page; every staff member may change them except the texting switch,
  which stays couple only.
- **Plain, native, no new library.** The panel is a native dialog (keyboard,
  focus and screen-reader behavior for free), styled with the console's one
  stylesheet. Mockups are in `specs/007-admin-setup-guide/design/`.

## Consequences

- Adding a step is one entry in `src/lib/setup/steps.ts` and one case in
  `status.ts`.
- The two new tables are reached through loose typing until
  `npm run db:types` is run on a machine with Docker.
