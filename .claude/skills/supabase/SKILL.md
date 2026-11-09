---
name: supabase
description: Inspect and verify the hosted wedding-website Supabase project from an agent session using SUPABASE_ACCESS_TOKEN. Use to check whether a merge deployed its migrations, read migration history, run read-only SQL, view auth settings, or use the Supabase CLI. Read-only by default.
---

# Supabase

Project `wedding-website`: ref `vwhgwmvbzyzeawrzduqs`, region `us-east-1`.
Access is the `SUPABASE_ACCESS_TOKEN` environment variable (a management token,
not a database or API key). Background and rules: [AGENTS.md](../../../AGENTS.md).

## Rules

- Never print, log or commit a token, the database password or an API key.
  Check variables with `[ -n "$SUPABASE_ACCESS_TOKEN" ]`, never `echo` them.
- The hosted database is production and will hold the real guest list. Prefer
  counts and schema over rows; never print guest names, emails or addresses.
- **No DDL through the SQL endpoint or dashboard.** Schema changes go through
  files in `supabase/migrations/` (`npx supabase migration new <name>`).
- Always send `"read_only": true` with SQL unless the user asked for a write.
- Ask the user first before changing auth settings, applying anything to the
  hosted database, or deleting. Read-only calls need no confirmation.
- Agent containers only reach ports 80 and 443. Anything that opens a Postgres
  connection (`supabase db push`, `migration list`, `db diff`, `psql`) times out
  here. Use the HTTPS Management API below, or give the user the exact command
  to run on their own machine. Do not retry.

## Setup in a shell

```bash
S=https://api.supabase.com/v1
R=vwhgwmvbzyzeawrzduqs
sb() { curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$S$1"; }
sql() { curl -sS -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$1\", \"read_only\": true}" "$S/projects/$R/database/query"; }
```

## Common tasks

| Task                           | Call                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| Project status                 | `sb "/projects/$R"`                                                |
| Migration history              | `sb "/projects/$R/database/migrations"`                            |
| Read-only SQL                  | `sql "select count(*) from supabase_migrations.schema_migrations"` |
| Auth settings                  | `sb "/projects/$R/config/auth"`                                    |
| Edge functions                 | `sb "/projects/$R/functions"`                                      |
| GitHub-integration deploy runs | `sb "/projects/$R/actions"`                                        |
| One run's step-by-step log     | `sb "/projects/$R/actions/<run id>/logs"`                          |
| Git-linked branch record       | `sb "/projects/$R/branches"`                                       |

The SQL endpoint answers HTTP 201 on success; that is normal.

## How migrations reach the hosted database

Merging to `main` deploys them: the Supabase GitHub integration clones the
repo and applies new migration files. Do not run `db push` by hand to ship one.
The integration does **not** apply seed data, `config.toml` settings (Auth etc.;
see `docs/manual-setup.md`), or Edge Functions and buckets not declared in
`config.toml`. Each migration runs in one transaction, so no
`create index concurrently`.

## Checking whether a merge deployed

1. List the runs (`/actions`) and read the newest run's logs; look for one
   "Applying migration" line per new file and no failed step.
2. Compare the hosted history (`database/migrations`, or
   `select version, name from supabase_migrations.schema_migrations` through the
   read-only SQL endpoint) with the files in `supabase/migrations/`. Every file
   should have a matching version.
3. Do not infer success from the dashboard alone. Supabase stores no applied-at
   time per migration; the run's `created_at` is the evidence for when.

## CLI

`npx supabase` is a dev dependency (run `npm ci --ignore-scripts` first in a
fresh container). It reads `SUPABASE_ACCESS_TOKEN`, so
`npx supabase link --project-ref vwhgwmvbzyzeawrzduqs` needs no login. If a
user runs `db push` on their own machine, run `--dry-run` first and check
`supabase/config.toml` for Vault secrets (`--skip-vault` skips them). The
database password is `SUPABASE_DB_PASSWORD`; never print it.

## Verified

Checked on 2026-11-09: project list, migration history (18 entries), read-only
SQL and the actions list all returned success with this token.
