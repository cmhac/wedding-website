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
- Git-linked branch record: `GET /projects/<ref>/branches` (the `main` entry
  exists only because the GitHub integration is connected).
- Deployment runs from the GitHub integration: `GET /projects/<ref>/actions`
  lists them (with the step statuses clone, pull, health, configure, migrate,
  seed, deploy), and `GET /projects/<ref>/actions/<run id>/logs` gives the
  step-by-step log, including one "Applying migration" line per file.

### How migrations reach the hosted database

**Merging to `main` deploys them.** The Supabase GitHub integration is
connected to `cmhac/wedding-website` with deploy-to-production on. When a merge
to `main` adds migration files, Supabase clones the repo and applies the new
ones. The first merge to `main` on 2026-10-25 applied all 17 existing
migrations in about 4 seconds, with no errors. Do not run `db push` by hand to
ship a migration; merge it instead.

What the integration does **not** do, so these stay manual or separate:

- It skips seed data on the production branch, so the hosted database has none.
- It skips `config.toml` settings (Auth, API, magic-link config) on the
  production branch. Those are listed in
  [docs/manual-setup.md](docs/manual-setup.md).
- It deploys only Edge Functions and storage buckets declared in `config.toml`.
  The 2026-10-25 run reported "No functions to deploy" and no buckets.
- Per Supabase's documentation, it runs each migration in a single
  transaction. A statement that cannot run in one, such as
  `create index concurrently`, would fail there even though `db push` accepts
  it. Keep such statements out of migrations.
- Per the same documentation, a migration version in the hosted history with no
  matching file makes the deploy step fail, and a file with a timestamp older
  than the latest applied migration still runs but ends with a warning.

**To check whether a merge deployed**, read the action run logs (see above)
and compare the migration history
(`select version, name from supabase_migrations.schema_migrations`, through the
read-only SQL endpoint) with the files in `supabase/migrations/`. Do not infer
success from the dashboard alone. Supabase stores no applied-at time per
migration, so the run's creation time is the evidence for when it happened.

A GitHub Actions `db push` job was considered and rejected as redundant. The
one open improvement is making the Supabase check a required status check in
GitHub branch protection, so a pull request with a failing migration cannot be
merged. That is a repository setting an agent cannot change.

### What agent containers can reach

Agent containers only allow outbound traffic on ports 80 and 443, even when the
environment's network access is set to full. Tested on 2026-10-25: GitHub on
80 and 443 connected, while GitHub on 22, Gmail SMTP on 465 and 587, and the
Supabase pooler on 5432 and 6543 all timed out. The Supabase side was ruled out
as the cause: the project's network restrictions allow every address, and the
pooler is enabled. The direct database host also does not resolve from the
container.

So anything that opens a Postgres connection fails here with "Connection timed
out": `supabase db push`, `supabase migration list`, `supabase db diff`, and
direct `psql`. `supabase link` works because it only uses HTTPS. For hosted
database checks, use the Management API over HTTPS (the read-only SQL endpoint
and the endpoints above). If a task truly needs a Postgres connection, give the
user the exact commands to run on their own machine rather than retrying.

### Supabase CLI

The CLI is a dev dependency (`npx supabase`; run `npm ci --ignore-scripts`
first in a fresh container). It reads `SUPABASE_ACCESS_TOKEN` from the
environment, so `npx supabase link --project-ref vwhgwmvbzyzeawrzduqs` needs no
login. Commands that talk to the database over Postgres do not work from agent
containers (see above) and are normally unnecessary because merging to `main`
deploys migrations.

If someone does run a push from their own machine, `npx supabase db push`
needs the database password (`SUPABASE_DB_PASSWORD` or `--password`). Run
`npx supabase db push --dry-run` first and confirm the list of pending
migrations before the real push. `db push` also updates Vault secrets declared
in `supabase/config.toml` unless `--skip-vault` is passed; check what is
declared there first.

The remaining manual settings are listed in
[docs/manual-setup.md](docs/manual-setup.md).
