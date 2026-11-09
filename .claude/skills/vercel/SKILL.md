---
name: vercel
description: Inspect the wedding-website Vercel project from an agent session using VERCEL_ACCESS_TOKEN. Use to check deployments, read build logs for a failed build, list environment variable names, or check domains. Read-only by default.
---

# Vercel

Project `wedding-website`: id `prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL`, team
`team_JWoc2UeuwDeznYpkbi808p9P`. Access is the `VERCEL_ACCESS_TOKEN`
environment variable. Background and rules: [AGENTS.md](../../../AGENTS.md).

## Rules

- Never print, log or commit the token or any secret value. Check it is set
  with `[ -n "$VERCEL_ACCESS_TOKEN" ]`, never `echo` it.
- List environment variables by **name only**. Do not request decrypted values
  unless the task needs them.
- Read-only calls need no confirmation. Ask the user first before creating or
  changing environment variables, redeploying, changing domains, or deleting.
- The token cannot read user or team info (`/v2/user` and `/v2/teams` fail).
  That is expected. Pass the project id and `teamId` directly.

## Setup in a shell

```bash
V=https://api.vercel.com
P=prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL
T=team_JWoc2UeuwDeznYpkbi808p9P
vc() { curl -sS -H "Authorization: Bearer $VERCEL_ACCESS_TOKEN" "$V$1"; }
```

## Common tasks

| Task                       | Call                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| Project details            | `vc "/v9/projects/$P?teamId=$T"`                                        |
| Recent deployments         | `vc "/v6/deployments?projectId=$P&teamId=$T&limit=5"`                   |
| One deployment             | `vc "/v13/deployments/<dpl id>?teamId=$T"`                              |
| Build log for a deployment | `vc "/v3/deployments/<dpl id>/events?teamId=$T&limit=-1"`               |
| Environment variable names | `vc "/v9/projects/$P/env?teamId=$T"`, then read only the `key`/`target` |
| Domains                    | `vc "/v9/projects/$P/domains?teamId=$T"`                                |

## Diagnosing a failed build

1. List recent deployments; note the `uid` and `state` (`READY`, `ERROR`,
   `BUILDING`) of each, and the commit that triggered the failed one
   (`meta.githubCommitSha`).
2. Fetch the build log events for the failed deployment. Each event has a
   `type` (such as `stderr`) and `text`. Print the `text` of the last
   `stderr` events first; the error is usually near the end.
3. Reproduce locally with `npm run build` (and `npm run type-check`, `npm run lint`)
   on that commit before changing anything.
4. A missing variable is a common cause: compare the names Vercel holds with
   `.env.example`. Report which are missing; do not set them without asking.

## Verified

Checked on 2026-11-09 against the live project: project, deployments, env
names and the build-log events endpoint all returned HTTP 200 with this token.
