# Wedding Website

[![CI](https://github.com/cmhac/wedding-website/actions/workflows/ci.yml/badge.svg)](https://github.com/cmhac/wedding-website/actions/workflows/ci.yml)

Source for Chris and Hannah's wedding website: the public site, RSVP management,
guest communications, and the email designs. One repo for all of it.

> Status: bootstrapped. Tooling and project structure are in place; no
> application code yet. See [docs/architecture.md](docs/architecture.md).

## Stack

- [Next.js](https://nextjs.org), [React](https://react.dev), [TypeScript](https://www.typescriptlang.org), [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com) for database, auth (magic links) and API
- [Resend](https://resend.com) for email, with [React Email](https://react.email) templates
- [Jest](https://jestjs.io) and [React Testing Library](https://testing-library.com/react) for tests
- ESLint, Prettier, Husky and lint-staged for code quality

## Getting started

Requires Node 22 (see `.nvmrc`) and Docker (for local Supabase).

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

## Repository layout

See [CLAUDE.md](CLAUDE.md) for the directory map and conventions.
