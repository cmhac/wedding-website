# Wedding Website

[![CI](https://github.com/cmhac/wedding-website/actions/workflows/ci.yml/badge.svg)](https://github.com/cmhac/wedding-website/actions/workflows/ci.yml)

Source for Chris and Hannah's wedding website: the public site, RSVP management,
guest communications, and the email designs. One repo for all of it.

> Status: the backend is built (database, guest API, admin API, email sending).
> A minimal, temporary v0 admin console exists
> ([specs/002-admin-console-v0](specs/002-admin-console-v0/plan.md)). Guest-facing
> screens and the public site are not provided; the designer builds them against
> [docs/guest-api.md](docs/guest-api.md) and [docs/admin-api.md](docs/admin-api.md).
> See [docs/architecture.md](docs/architecture.md) and
> [docs/manual-setup.md](docs/manual-setup.md) for the dashboard settings.

## Stack

- [Next.js](https://nextjs.org), [React](https://react.dev), [TypeScript](https://www.typescriptlang.org), [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com) for database, auth (magic links) and API
- [Resend](https://resend.com) for email, with [React Email](https://react.email) templates
- [Jest](https://jestjs.io) and [React Testing Library](https://testing-library.com/react) for tests
- ESLint, Prettier, Husky and lint-staged for code quality

## Getting started

Requires Node 24 or newer (`.nvmrc` pins 26) and Docker (for local Supabase).

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run db:start             # prints local Supabase URL and keys
npm run dev
```

Preview email templates with `npm run email:dev`.

## Scripts

| Script                                      | What it does                            |
| ------------------------------------------- | --------------------------------------- |
| `npm run dev` / `build` / `start`           | Next.js                                 |
| `npm run lint` / `lint:fix`                 | ESLint                                  |
| `npm run type-check`                        | TypeScript                              |
| `npm test` / `test:watch` / `test:coverage` | Jest                                    |
| `npm run format` / `format:check`           | Prettier                                |
| `npm run email:dev` / `email:export`        | React Email preview / HTML export       |
| `npm run db:start` / `stop` / `reset`       | Local Supabase                          |
| `npm run db:types`                          | Generate TypeScript types from local DB |
| `npm run test:db`                           | pgTAP database tests (local Supabase)   |

### Create a staff sign-in (the couple or the planner)

Staff sign-in accounts exist only because this script creates them; the sign-in
endpoint never creates users. It needs `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, and prints only the new user id.

```bash
node --env-file=.env.local scripts/create-staff-user.ts <email> "<display name>" <couple|planner>
```

### Admin console (temporary v0)

With `npm run dev` running, staff sign in at `/admin` (a magic link, for accounts
made with the script above). The console lives in `src/app/(admin)`,
`src/components/admin` and `src/lib/admin`, styled by one plain stylesheet,
`src/app/(admin)/admin.css`. It is separate from the designer's work and uses
the same admin API and row-level security as any later admin frontend. See
[specs/002-admin-console-v0](specs/002-admin-console-v0/plan.md).

## Repository layout

See [CLAUDE.md](CLAUDE.md) for the directory map and conventions. In short:
`src/app/api` holds the guest and admin APIs, `src/app/(admin)` the v0 admin
console, `src/lib` the shared logic, `supabase` the migrations and database
tests, and `docs` the API handoff documents and decision records.
