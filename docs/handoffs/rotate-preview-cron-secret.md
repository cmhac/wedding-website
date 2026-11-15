# Handoff: rotate the Preview scheduled-sending secret

**Temporary.** This file and its branch (`claude/temp-rotate-preview-cron-secret`)
exist only for this one job. Delete both when it is done (see "Clean up").

## Why

The secret that proves a scheduled send is genuine is called `CRON_SECRET` in
Vercel and `cron_secret` in Supabase Vault. The two copies must match. On
2026-11-15 a new one was created for **Preview** only, but its value was printed
into a chat transcript while it was generated. Rotating it makes that copy
worthless. The goal is a new value that no person and no agent transcript ever
sees.

## What is in scope

| Where                     | Item                                                       | Identifier                                    |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| Vercel, project           | `wedding-website`, team ID `team_JWoc2UeuwDeznYpkbi808p9P` | project ID `prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL` |
| Vercel, variable          | `CRON_SECRET`, type sensitive, target **preview** only     | variable ID `SekVKxybH1AqSML3`                |
| Supabase, **dev** project | `dev-wedding-website`; Vault secret named `cron_secret`    | project ref `gjanquvyvlqpxmdgfzdz`            |

## Do not touch

- The **production** `CRON_SECRET` in Vercel (variable ID `YfZEBhBKhe0eyzay`,
  target production) and the **production** Supabase project
  (`vwhgwmvbzyzeawrzduqs`, whose Vault has `cron_secret` and `site_url`). Rotating
  those would stop live scheduled sends until a redeploy.
- Any other Vercel variable or Vault secret.

## Rules for the agent

1. **Never print, log, echo or write the new secret anywhere**: not to the
   terminal, a file, a commit, a comment, or your own reply. Generate it in a shell
   variable inside one script, send it to both services from that same script,
   then `unset` it. Print only HTTP status codes and a length.
2. Do not paste the old secret either. You cannot read the Vercel one (it is
   sensitive) and you do not need the Vault one.
3. Needs `VERCEL_ACCESS_TOKEN` and `SUPABASE_ACCESS_TOKEN`. Neither token should
   be printed. The Supabase token needs permission to run SQL on the dev project;
   the Vercel token needs to edit environment variables on the project above.
4. Stop and report instead of improvising if any call fails or an identifier
   does not match what is in the table above.

## Steps

1. Check the identifiers. Read the Vercel variable's metadata (not its value) and
   confirm ID `SekVKxybH1AqSML3` is named `CRON_SECRET`, type sensitive, target
   `["preview"]` only. Confirm the dev Vault has exactly one secret named
   `cron_secret`:

   ```sql
   select name, created_at, updated_at from vault.secrets where name = 'cron_secret';
   ```

2. Run one script like the one below. It uses the Vercel REST call "edit an
   environment variable" (`PATCH /v9/projects/{idOrName}/env/{id}`, body field
   `value`) and the Supabase Management API call "run a query"
   (`POST /v1/projects/{ref}/database/query`, body fields `query` and
   `parameters`). Passing the secret as a parameter keeps it out of the SQL text
   and the statement log. Check both reference pages first, since the Supabase
   endpoint is marked beta.

   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   S="$(openssl rand -hex 32)"

   # 1. Vercel: replace the Preview variable's value.
   code=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
     "https://api.vercel.com/v9/projects/prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL/env/SekVKxybH1AqSML3?teamId=team_JWoc2UeuwDeznYpkbi808p9P" \
     -H "Authorization: Bearer $VERCEL_ACCESS_TOKEN" -H 'Content-Type: application/json' \
     --data "$(jq -nc --arg v "$S" '{value:$v}')")
   echo "vercel: $code"

   # 2. Supabase dev Vault: update the matching secret, value passed as a parameter.
   code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
     "https://api.supabase.com/v1/projects/gjanquvyvlqpxmdgfzdz/database/query" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
     --data "$(jq -nc --arg v "$S" '{query:"select vault.update_secret((select id from vault.secrets where name = $$cron_secret$$), $1::text)", parameters:[$v]}')")
   echo "supabase: $code"

   unset S
   ```

   If the query call rejects `parameters` or the placeholder form, do not fall
   back to putting the value inline in the SQL without telling the user first.
   Inline values can end up in logs.

3. Verify without revealing anything.
   - Vercel: read the variable's metadata and confirm its `updatedAt` changed
     and it is still sensitive and still preview only. Confirm the production
     variable's `updatedAt` did **not** change.
   - Supabase dev:

     ```sql
     select name, updated_at, length(decrypted_secret) as len
     from vault.decrypted_secrets where name = 'cron_secret';
     ```

     `len` should be 64 and `updated_at` should be now.

   You cannot compare the two copies directly (Vercel will not return the
   value). That is expected; both were written from the same variable in one
   script.

4. Tell the user a fresh Preview deploy is needed before the setup guide and the
   route see the new value, because Vercel applies variables at build time.

## Clean up (when done)

Delete this file and its branch. Do not open a pull request for them:

```bash
git checkout claude/keen-carson-6cbadv
git push origin --delete claude/temp-rotate-preview-cron-secret
git branch -D claude/temp-rotate-preview-cron-secret
```

Then report: what was rotated, the status codes, the verification results, and
that this file and branch are gone.
