# Research: Placeholder homepage

## R1. Where the page lives and how it gets a layout

**Decision**: a new route group `src/app/(site)` with its own root layout, `page.tsx` for `/`, and `site.css`.

**Rationale**: the app deliberately has no top-level layout (decision 0009), so every route group needs its own root layout. A group keeps the placeholder easy to delete or replace.

**Alternatives**: a top-level `src/app/layout.tsx` and `page.tsx` (imposes a layout on the designer); putting `/` in the `(admin)` group (wrong stylesheet and metadata, confusing ownership).

## R2. Deciding signed in or not

**Decision**: the page calls the existing `getSession()` (`src/lib/auth/session.ts`). Any session (guest or staff) shows the placeholder; `null` shows the prompt.

**Rationale**: it reads staff status on every call, so a revoked staff role or an expired session falls through to the prompt with no error (FR-015). A signed-in user who is neither staff nor in a household returns `null`, which is the safe default.

**Alternatives**: checking only the cookie (would show the placeholder to a revoked account); a new "who am I" API (not needed for a server-rendered page).

## R3. One address for guests and staff, with no new database function

**Decision**: extend `POST /api/guest/sign-in` (`sendLink`). After the existing attempt limit, look the address up among household contacts. If it is a household address, send the existing household link. If not, call a new shared helper, `requestStaffLink(supabase, address)` in `src/lib/auth/staff-sign-in.ts`, which does what the admin sign-in route does today (`signInWithOtp` with `shouldCreateUser: false` and the `/auth/callback?audience=staff` redirect). Supabase only sends when a staff Auth user exists, and the existing Send Email hook delivers it. Errors, unknown addresses and limits all end in the same neutral answer after the same minimum time. The admin sign-in route calls the same helper, so there is one place.

**Rationale**: the only Auth users are staff (created by script) and household accounts (`household-<id>@<domain>`, never mailed). Decision 0012 states that staff addresses cannot be household addresses, so the order of the two checks cannot change the outcome and the spec's "address on both lists" case cannot happen (the spec is updated). A staff lookup function would need a migration against `auth.users` for no gain. As a guard, addresses on the household account domain are ignored before any Supabase call, so nobody can request a link for a household's internal account.

**Alternatives**: a database function `staff_email_exists` (extra migration, pgTAP tests, regenerated types, and only useful if staff addresses could also be household contacts); a second endpoint that the browser tries after the first (reveals which kind of address it was); a "Staff sign in" link (the couple declined).

## R4. Same answer and same time for every address

**Decision**: keep the existing neutral `202` after `withMinimumDuration(1500)` for every outcome. The message text changes to cover both audiences: "If that address is on the guest list or belongs to a staff account, a link is on its way." The per-IP limiter (5 a minute) and the durable per-address limit stay in front of both branches. The in-memory per-address limiter on the old admin route stays on the admin route only.

**Rationale**: the staff branch makes one Supabase call plus the hook, comparable to the household branch's lookup plus email. The 1.5 s floor hides the difference as it does today.

**Risk noted**: the staff link uses Supabase's PKCE flow, so the link must be opened in the browser that requested it (the same limitation the admin sign-in page already has). Opened elsewhere, it ends on the failure page, which now links back to the prompt. Recorded in the quickstart.

## R5. Where guests and staff land

**Decision**: change the default guest landing path from `/rsvp` to `/` in `src/lib/auth/redirect.ts` (`GUEST_RSVP_PATH` still overrides it; it is not set in Vercel, checked 2026-11-09 by variable name). Staff keep landing on `/admin` (clarification, FR-019). `allowedNext` keeps working: guests may use `/`, staff may use `/admin` or `/`. The personal-link route, `/auth/confirm` and `/auth/callback` need no change beyond the helper.

**Rationale**: `/rsvp` does not exist yet, so today every successful sign-in ends on a not-found page. The designer sets `GUEST_RSVP_PATH` when the real RSVP page exists, or changes the default.

**Alternatives**: a `/rsvp` page that redirects to `/` (an extra route to delete later).

## R6. Light/dark theme without a library

**Decision**: CSS custom properties and `color-scheme` in `site.css`. The default follows `prefers-color-scheme`; `html[data-theme="light"]` and `html[data-theme="dark"]` override it. A tiny inline script in the layout's `<head>` reads `localStorage["theme"]` and sets `data-theme` before first paint (try/catch, accepts only `light` or `dark`). `ThemeToggle` (client) reads the current theme on mount, flips it, writes `localStorage` (try/catch) and sets the attribute. It is a button with `role="switch"` and `aria-checked`, labelled "Dark mode". Until mounted it renders in a neutral state, so server and client markup match.

**Rationale**: smallest approach that meets "system-aware" and "no flash". The sign-in prompt shares the stylesheet and follows the system setting (the inline script also applies a saved choice there, which is harmless).

**Alternatives**: `next-themes` (a dependency for ~20 lines of work); cookie-based theme (would make the page dynamic per theme and add a cookie for guests); toggle only via CSS (no memory).

## R7. Sign-out on the placeholder, and a bug it exposes

**Decision**: the "Sign out" control calls the existing `POST /api/guest/sign-out` and then reloads `/`. It works for staff sessions too because it only clears the current cookies. The route is changed to `signOut({ scope: "local" })`.

**Rationale**: Supabase's `signOut()` defaults to the `global` scope, which ends every session of the user ([Supabase docs](https://supabase.com/docs/guides/auth/signout)). A household is one shared Auth user, so today's guest sign-out would also sign out every other device, contradicting `docs/guest-api.md` ("ends this device's session") and the requirement that it must not. The admin console's own sign-out action is unchanged (staff are individuals).

**Alternatives**: leave it (breaks FR-008a and surprises families).

## R8. Admin sidebar button

**Decision**: add a first item to `AdminShell`: a plain anchor to `/` with `target="_blank"` and `rel="noopener"`, labelled "View home page", placed above the brand block in the sidebar and at the top of the phone drawer. Styled in `admin.css` only. Console pages already require staff, so it is staff-only by construction; the sign-in and error pages do not use the shell.

**Rationale**: the browser shares the session cookie across tabs, so no sign-in is repeated.

## R9. Scope amendment is permanent, and the constitution

**Decision**: amend `CLAUDE.md` permanently: this repository builds, in addition to the backend and admin console, one minimal placeholder homepage (a sign-in prompt and a signed-in "Coming soon" page) in plain CSS. Still out of scope: every other guest-facing screen, email content (apart from the existing first-draft exception), a design system, theming library or component library. Record it as decision 0013 and update `docs/architecture.md`, `README.md` and `docs/guest-api.md`.

The constitution does not contain the scope rule (that lives in `CLAUDE.md`, `README.md`, the architecture document and decision 0009), but it does state "Frontend: ... Tailwind CSS" and the governance section requires `CLAUDE.md` to stay consistent with it. The placeholder and the admin console both use plain CSS by recorded decision, and the constitution says exceptions are recorded in `docs/decisions/`. So the plan includes a constitution amendment through `/speckit-constitution` (a MINOR version bump, 1.1.0): the Frontend line notes that the admin console and the placeholder homepage use one plain stylesheet each by recorded decision and that the designer's screens use Tailwind; no principle changes. The Auth line ("magic-link sign-in for everyone") is still true. No other constitution text needs to change.

## R10. Search engines and caching

**Decision**: the layout sets `robots: { index: false, follow: false }`; the page reads cookies so it is rendered per request and never statically cached; sign-in routes already send `no-store` and `X-Robots-Tag: noindex`.

## R11. Failure page

**Decision**: change `AuthError` to link to `/` ("Back to sign in") instead of `/admin/sign-in`, so guests and staff both have a way back. The admin sign-in page stays reachable by its address for the console.
