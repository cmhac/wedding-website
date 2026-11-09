# Implementation Plan: Placeholder homepage

**Branch**: `004-placeholder-homepage` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-placeholder-homepage/spec.md`

## Summary

Add the site's front door at `/`: a small server-rendered page that shows a plain sign-in prompt to visitors without a session, and to anyone signed in (a household or staff) a blank page with the line "Coming soon 👀", a light/dark toggle and a "Sign out" link. One typed email address now serves guests and staff: the existing guest sign-in endpoint sends the household link for a household address and otherwise asks Supabase for a staff link, always answering the same way in the same time. Guest sign-in routes land on `/` instead of the unbuilt `/rsvp`; the sign-in failure page links back to `/`. The admin console's sidebar gets a first item that opens `/` in a new tab. Guest sign-out is fixed to end only the current device's session. No database change.

## Technical Context

**Language/Version**: TypeScript (strict) on the Node version in `.nvmrc`, Next.js App Router (Next.js 16: `src/proxy.ts`), React.

**Primary Dependencies**: existing only: `@supabase/ssr` and `@supabase/supabase-js`, `zod`. No theming, font or UI library. Theme is plain CSS plus one tiny inline script and one small client component.

**Storage**: none new. The theme choice lives in the visitor's browser (`localStorage`, read inside try/catch). Sessions are the existing Supabase Auth cookies.

**Testing**: Jest and React Testing Library (route handlers tested in the node environment, components in jsdom). Async pages are not covered by Jest (see decision 0009), so the page's two branches are thin and the logic lives in tested helpers and components; the quickstart is the written end-to-end walkthrough.

**Target Platform**: Vercel production (`hannahandchris.wedding`) and preview deployments; evergreen browsers on phones and desktops.

**Project Type**: web application (single Next.js app).

**Performance Goals**: no wrong-theme flash on first paint; the page is static-sized (one line, two small controls), so no numeric budget beyond that.

**Constraints**: sign-in answers and timing must not reveal who is a guest or staff (existing 1.5 s floor, existing limits); no guest or staff data on the page; no new environment variables; the page is not indexed.

**Scale/Scope**: about 150 households plus 2 to 3 staff; one page, one form, one toggle, one sidebar item.

## Constitution Check

_GATE: must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                               | Status                          | Notes                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Test-first                           | Pass                            | Every task writes the failing test first: redirect default, sign-in route (staff and household branches, neutral answer), sign-out scope, theme helper and toggle, prompt form, page branches' presentational components, admin sidebar item.                                                                                    |
| II. Schema by migration, RLS everywhere | Pass                            | No schema change (see research R3: staff lookup reuses Supabase's own "user exists" check, so no new database function is needed).                                                                                                                                                                                               |
| III. Secrets and guest data protected   | Pass                            | No new secrets or variables. The prompt never shows or logs an address; logs keep outcome codes only.                                                                                                                                                                                                                            |
| IV. One repository                      | Pass                            | Everything, including docs and the decision record, lives here.                                                                                                                                                                                                                                                                  |
| V. Current tooling, recorded decisions  | Pass, with a recorded departure | The stack line says "Tailwind CSS" for the frontend. Like the admin console (decision 0009), the placeholder uses one plain stylesheet so the designer's later work is not constrained. This departure and the permanent scope amendment are recorded in a new decision record (0013) and in the constitution (see research R9). |
| Quality gates                           | Pass                            | `format:check`, `lint`, `type-check`, `test`, plus `npm run build` because a new root layout is added.                                                                                                                                                                                                                           |

No violations, so the complexity table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-placeholder-homepage/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── home-and-sign-in.md
└── tasks.md          # created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (site)/                      # NEW route group, its own root layout (like (admin))
│   │   ├── layout.tsx               # <html>, noindex metadata, inline theme script, site.css
│   │   ├── page.tsx                 # "/": session check, then prompt or placeholder
│   │   ├── site.css                 # the one plain stylesheet for the site group
│   │   └── __tests__/site-css.test.ts
│   ├── (admin)/auth/error/page.tsx  # unchanged page; AuthError now links back to "/"
│   ├── api/guest/sign-in/route.ts   # CHANGED: household link, else staff link; one neutral answer
│   ├── api/guest/sign-out/route.ts  # CHANGED: ends this device's session only
│   └── api/admin/sign-in/route.ts   # CHANGED: uses the shared staff-link helper
├── components/
│   ├── site/                        # NEW, presentational, tested with Jest
│   │   ├── Placeholder.tsx
│   │   ├── SignInPrompt.tsx         # client form
│   │   ├── ThemeToggle.tsx          # client
│   │   └── __tests__/
│   └── admin/AdminShell.tsx         # CHANGED: first sidebar item opens "/" in a new tab
├── lib/
│   ├── auth/redirect.ts             # CHANGED: default guest landing "/" (still GUEST_RSVP_PATH)
│   ├── auth/staff-sign-in.ts        # NEW: shared "email a staff link" helper
│   └── site/theme.ts                # NEW: theme storage key, validation, inline script text
docs/
├── decisions/0013-placeholder-homepage.md   # NEW
├── guest-api.md, architecture.md, manual-setup.md   # updated in the same change
CLAUDE.md, README.md, .specify/memory/constitution.md  # scope amendment (see research R9)
```

**Structure Decision**: a second route group, `(site)`, with its own root layout and one stylesheet, mirroring how `(admin)` is built (decision 0009). No top-level `src/app/layout.tsx` is added, so the designer's eventual site layout is not pre-empted: they replace the contents of `(site)` or move `/` elsewhere. Behavior sits in tested helpers and small components; the page file only reads the session and chooses a branch.

## Complexity Tracking

No constitution violations to justify.
