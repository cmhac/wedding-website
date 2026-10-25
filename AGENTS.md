# Agent guidance

Project conventions live in [CLAUDE.md](CLAUDE.md); read it first. This file
covers working with the hosted services from an agent session.

## Hosted services and access tokens

Two hosted projects, both named `wedding-website`, are reachable from agent
sessions through environment variables:

| Variable                | Service  | Project                                                                                      |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `VERCEL_ACCESS_TOKEN`   | Vercel   | `wedding-website` (`prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL`, team `team_JWoc2UeuwDeznYpkbi808p9P`) |
| `SUPABASE_ACCESS_TOKEN` | Supabase | `wedding-website` (project ref `vwhgwmvbzyzeawrzduqs`, `us-east-1`)                          |

The Supabase project was created through the Vercel integration, so Vercel
already holds the `SUPABASE_*` and `POSTGRES_*` variables for it.

### Rules

- **Never print, log, commit or paste a token or any secret value.** Check that
  a variable is set with `[ -n "$VERCEL_ACCESS_TOKEN" ]`, never `echo` it. When
  listing Vercel environment variables or Supabase API keys, print names only.
- **Guest data is personal data.** When querying the production database, prefer
  counts and schema over rows, and never print guest names, emails or addresses.
- **Schema changes only through migrations** in `supabase/migrations/`, as in
  CLAUDE.md. Do not run DDL through the SQL endpoint or the dashboard.
- **Confirm before anything outward-facing or hard to reverse**: applying
  migrations to the hosted database, changing auth settings, creating or
  changing environment variables, deploying to production, deleting anything.
  Read-only calls need no confirmation.
- The hosted database holds the real guest list once it is imported. Treat it
  as production, not as a scratch database. Use the local Supabase
  (`npm run db:start`) for experiments.

### Vercel API (`https://api.vercel.com`)

Send `Authorization: Bearer $VERCEL_ACCESS_TOKEN`. The token can read the
project but cannot list teams or read user info (`/v2/teams` and `/v2/user`
fail), so pass the project id directly and add `teamId=team_JWoc2UeuwDeznYpkbi808p9P`
to calls that need it.

- Project: `GET /v9/projects/<project id>`
- Deployments: `GET /v6/deployments?projectId=<id>&teamId=<team id>&limit=5`
- Environment variable names: `GET /v9/projects/<id>/env` (values come back
  encrypted; do not request decrypted values unless the task needs them)
- Domains: `GET /v9/projects/<id>/domains`

### Supabase Management API (`https://api.supabase.com/v1`)

Send `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`. This is a personal-style
management token, not a database or API key.

- Project: `GET /projects/<ref>`
- Migration history: `GET /projects/<ref>/database/migrations`
- Edge functions: `GET /projects/<ref>/functions`
- Auth settings: `GET /projects/<ref>/config/auth`
- Read-only SQL: `POST /projects/<ref>/database/query` with
  `{"query": "...", "read_only": true}`. The read-only flag makes Postgres
  reject writes; always set it unless a migration is the point.

### Supabase CLI

The CLI is a dev dependency (`npx supabase`). It reads `SUPABASE_ACCESS_TOKEN`
from the environment, so `npx supabase link --project-ref vwhgwmvbzyzeawrzduqs`
needs no login. Pushing migrations (`npx supabase db push`) also needs the
database password, supplied through `SUPABASE_DB_PASSWORD` or `--password`.
Run `npx supabase db push --dry-run` first and confirm the list of pending
migrations before the real push.

`db push` also updates Vault secrets declared in `supabase/config.toml` unless
`--skip-vault` is passed. Check what is declared there before pushing.

The remaining manual settings are listed in
[docs/manual-setup.md](docs/manual-setup.md).
