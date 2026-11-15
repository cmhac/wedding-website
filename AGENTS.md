# Agent guidance

Project conventions live in [CLAUDE.md](CLAUDE.md); read it first. This file
covers working with the hosted services from an agent session.

## Hosted services and access tokens

One Vercel project and two Supabase projects are involved. The first two are
reachable from agent sessions through environment variables:

| Variable                | Service  | Project                                                                                      |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `VERCEL_ACCESS_TOKEN`   | Vercel   | `wedding-website` (`prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL`, team `team_JWoc2UeuwDeznYpkbi808p9P`) |
| `SUPABASE_ACCESS_TOKEN` | Supabase | `wedding-website`, **production** (project ref `vwhgwmvbzyzeawrzduqs`, `us-east-1`)          |

The third is the **dev** Supabase project, `dev-wedding-website` (project ref
`gjanquvyvlqpxmdgfzdz`, `us-east-1`, created 2026-11-12). Vercel's Preview and
Development environments use it, and Production uses the production project, so
previews never touch the real guest list. The variables above are not always set
in a session (`SUPABASE_ACCESS_TOKEN` was missing on 2026-11-15), and it is not
confirmed that the Supabase token covers the dev project. Without a token, use
the connectors described below.

The production Supabase project was created through the Vercel integration, so
Vercel already holds the `SUPABASE_*` and `POSTGRES_*` variables for it.

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

## Connectors (MCP tools)

Sessions may also have connectors for Vercel, Supabase, Resend and GitHub. They
work where the environment variables above are missing, and they were used to
find and fix a real problem on 2026-11-15, so what follows is from experience.
Some connector tools are listed by name only until you load them with
`ToolSearch` (for example `select:mcp__Vercel__create_deployment`); calling one
before its schema is loaded fails with a validation error.

The same rules apply as above: never repeat a secret, treat guest data as
personal data, and confirm before changing anything outward-facing. A person
saying "any non-destructive action is fine" while away covers that session only
and does not make changing auth settings or production variables routine.

### Vercel connector

- Ids: project `prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL`, team
  `team_JWoc2UeuwDeznYpkbi808p9P`. Pass `teamId` on every call. The tools name the
  project differently: `idOrName` on the environment variable and deployment
  tools, `projectId` on `list_deployments` and `get_runtime_logs`.
- **List variables safely.** `filter_project_envs` returns every variable with its
  value, is far too large to read, and is saved to a file. Do not read that file
  whole. Extract names and scopes only, for example
  `jq -r '.result.envs[] | select(.key|test("RESEND|EMAIL_FROM")) | [.key, (.target|tostring), .type] | @tsv' <file>`.
  Sensitive variables come back blank, which is how they are meant to behave.
- **Add a variable.** `create_project_env` takes a `requestBody` object:
  `{"key","value","type","target":["preview"]}`. Use `type: "sensitive"` for
  secrets (not available for the Development target) and `plain` for values that
  are not secret, such as the from address. Read a plain one back with
  `get_project_env`. Scope matters: Preview and Development share one set of
  Supabase variables, and Production has its own.
- **Variables apply only to new builds.** A deployment made before a variable was
  added does not have it. Compare the variable's `createdAt` with the
  deployment's creation time.
- **Redeploy a preview.** `create_deployment` with `forceNew: "1"` and a
  `requestBody` of `{"name", "project", "deploymentId": "<a preview deployment>"}`
  rebuilds it and leaves the target as preview. Never pass a `gitSource` with
  `ref: "main"`, which makes a production deployment. It was not confirmed
  whether a redeploy reads the current variables or the original build's, so
  after adding a variable, a new commit on the branch is the sure way to pick it
  up. Check progress with `get_deployment`; do not poll in a tight loop.
- **Runtime logs.** `get_runtime_logs` with the deployment id shows one entry per
  request. The app logs through `src/lib/log.ts` as JSON with an `event` and a
  `code`, so search for those rather than for addresses.

### Supabase connector

- `list_projects` shows both projects (production and dev) with their refs; pass
  the right `project_id` and double-check it before any write.
- **Logs.** `query_logs` takes a required `sql` argument (not a service name),
  written against a `logs` table with a `source` column: `postgres_logs`,
  `auth_logs`, `edge_logs`, `pgbouncer_logs` and `auth_audit_logs` exist. Read
  fields with `log_attributes['msg']`, `['error']`, `['status']`, `['path']`. The
  window is at most 24 hours (`iso_timestamp_start`). Select message, error and
  status only, never the email address columns.
- **No tool changes auth settings** (sender, SMTP, hooks, redirect addresses,
  rate limits). Reading them or changing them needs the Management API with a
  token that covers that project, or the dashboard. Say so and give the person
  exact steps rather than reaching for production settings.
- `execute_sql` and `apply_migration` exist but follow the migration rules above:
  schema changes go through files in `supabase/migrations/`, and queries are
  read-only unless a person asked otherwise.

### Resend connector

- Every call needs `context` (one neutral sentence with no personal data) and
  `llm_model`. The first response returns a `conversation_id`; pass that same one
  on every later call, and do not run calls in parallel before you have it
  (parallel first calls each get a different one).
- `list-domains` shows the verified sending domain (`updates.hannahandchris.wedding`
  at the time of writing). `list-api-keys` shows names and creation dates only.
- **Create a key.** `create-api-key` with `permission: "sending_access"` and the
  sending domain's `domainId` makes a key that can only send from that domain. The
  token is shown once, in the result. Put it straight where it is needed (a
  sensitive Vercel variable, or tell the person to paste it into the Supabase
  SMTP settings) and do not repeat it in replies, commits or docs. Use a separate
  key for each place it is used (production, preview site, dev Supabase SMTP) so
  one can be revoked alone. Names in use: "wedding-website production (sending
  only)" and "wedding-website preview (sending only)".
- `remove-api-key` and other deletes need the person's explicit confirmation by
  key name; deleting a key breaks whatever uses it.
- **Sent-mail lists contain real recipients.** `list-emails` returns addresses, so
  report counts, statuses and times only. An empty or stale list (nothing new
  since an earlier date) is useful evidence that mail never reached Resend.
- Do not send mail to guests with `send-email`; the site's own send paths record
  delivery in the database. A test send goes to the requesting person only, and
  only when they ask.

### GitHub connector

There is no `gh` CLI in cloud sessions. Use the GitHub tools for branches, pull
requests and file contents, as described in the session instructions, and write
pull request descriptions in plain English per CLAUDE.md.

### Diagnosing "sign-in email did not arrive"

Work from the outside in, and do not trigger sign-ins yourself (they email a real
person and use up the hourly limit):

1. Preview or production runtime logs: look for `admin_sign_in_failed` and its
   `code`. `over_email_send_rate_limit` means Supabase Auth refused to send.
2. The Supabase project's `auth_logs`: a `429: email rate limit exceeded`, and
   `mail.send` entries from `noreply@mail.app.supabase.io`, mean the project is
   on Supabase's built-in sender because it has no Send Email hook or custom
   SMTP. Fix: custom SMTP in that project (see "Staff sign-in email in the dev
   project" in [docs/manual-setup.md](docs/manual-setup.md)).
3. Resend's sent list: nothing new since an earlier date means the mail never
   reached Resend, which points at Supabase or the app rather than Resend.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
