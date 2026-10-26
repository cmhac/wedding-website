# Handoff: finishing production setup (Resend and email sign-in)

Written 2026-10-26 for an agent starting a fresh session in this repository. Read
[CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md) first; they hold the
rules, and this file does not repeat them. The owner is Chris (the user). Their
fiancée is Hannah. The wedding is in California and the guest list is global
(US, Canada, UK and Tanzania), which is one reason sign-in stays on email.

**Never print, paste or commit a secret.** Check a variable exists with
`[ -n "$NAME" ]`. Confirm with the user before anything outward-facing or hard
to reverse (see AGENTS.md). Plain-English rule: never cite a task or decision
number without saying what it is.

## Where things stand

The admin console v0 is built, tested, merged to `main` (pull request 33) and
deployed. Chris signed in to it on the live site with a magic link after the
production redeploy.

| Area                 | State                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live site            | `https://hannahandchris.wedding` (bought through Vercel Domains; `www.` redirects to it with a permanent redirect). Both are attached to the Vercel project and verified.                                                                                             |
| Hosted database      | Every migration applied, including the `actor_kind` column on the meal history table (`20261025201832`). It has no seed data and no households yet.                                                                                                                   |
| Staff accounts       | One: Chris, role couple, email `c.m.hacker1997@gmail.com`, display name "Chris". Hannah has no account yet; ask for her name and email, then use `scripts/create-staff-user.ts` (it needs the project's service-role key; fetch it without printing it).              |
| Supabase Auth (live) | Site URL is the production domain. The redirect list keeps the old preview entries and adds the production `/auth/callback` and `/auth/callback?audience=staff`. Open sign-up is off. Email provider is on. No custom email sender and no Send Email hook.            |
| Vercel settings      | Only the Supabase and Postgres values plus `NEXT_PUBLIC_SITE_URL` (production only). Missing: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET`.                                                                       |
| Supabase Vault       | The two secrets for scheduled sends (`site_url`, `cron_secret`) are not created yet (see "Supabase Vault" in `docs/manual-setup.md`).                                                                                                                                 |
| Sign-in email today  | Supabase's built-in sender: only delivers to members of the Supabase organization, about 2 emails an hour, testing use only. That is why guests cannot sign in yet. Chris is confirmed able to sign in, so their address is in the organization.                      |
| Text messages (SMS)  | Decided against for now: authentication stays email only. A draft spec for SMS exists only on the branch `ccr-148acb64-gkxwqr` (`specs/003-sms-sign-in-and-messaging/`), never merged and with no pull request. Leave it alone unless Chris asks. Do not build on it. |

## What to do next

Chris created a Resend API key and will give it to your session as an
environment variable; ask which name. Treat it as a setup key with full access.

1. **Check what the key can do before changing anything.** Read-only first, for
   example list domains: `GET https://api.resend.com/domains` with
   `Authorization: Bearer $<key>`. If it is refused, the key is sending-only;
   stop and tell Chris to make a full-access key in Resend, API Keys. Resend's
   API pages did not state which permission the create calls need, so do not
   assume.
2. **Add the sending domain.** Resend recommends a subdomain such as
   `updates.hannahandchris.wedding` over the root domain. `POST
https://api.resend.com/domains` with `{"name": "<subdomain>"}` returns the DNS
   records to add (an MX and an SPF text record on `send`, a DKIM text record on
   `resend._domainkey`, and possibly a tracking record).
   Confirm the plan and the chosen subdomain with Chris first.
3. **Add those DNS records through Vercel.** The domain uses Vercel's
   nameservers. Use `POST https://api.vercel.com/v2/domains/<domain>/records`
   with `teamId=team_JWoc2UeuwDeznYpkbi808p9P`. It is not confirmed that the
   Vercel token may write DNS records; if refused, give Chris the exact records
   to add in Vercel (Domains, DNS records) or use Resend's automatic setup.
   Paste only the host part of each name, not the full domain, and copy values
   exactly. Verification can take up to 72 hours; the dashboard has a "restart
   verification" action.
4. **Create the webhook.** `POST https://api.resend.com/webhooks` with the
   endpoint `https://hannahandchris.wedding/api/webhooks/resend` and the events
   `email.sent`, `email.delivered`, `email.bounced`, `email.complained`. The
   response includes the signing secret. Check the exact field names against
   Resend's webhook pages before calling.
5. **Create the app's own key with sending access only**, restricted to the new
   domain, and ask Chris to delete the setup key when you finish. Never leave a
   full-access key in production.
6. **Set the Vercel settings** (production target): `RESEND_API_KEY` (the
   sending-only key), `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` (an address on the
   verified domain, for example `Chris & Hannah <hello@updates.hannahandchris.wedding>`;
   confirm the wording with Chris), `CRON_SECRET` (generate a random value), and
   `SEND_EMAIL_HOOK_SECRET` only when the hook is turned on. Use the secret
   type for each. Then the production deployment must be rebuilt for them to
   take effect. Triggering a redeploy through the API was blocked by the
   permission system in the last session; do not work around it, ask Chris to
   click Redeploy (Vercel, Deployments, the latest Production one).
7. **Create the two Vault secrets** with the Supabase read-write SQL endpoint
   (`site_url` = `https://hannahandchris.wedding`, `cron_secret` = the same value
   as `CRON_SECRET`). AGENTS.md says schema changes go through migrations; Vault
   secrets are data, not schema, but confirm with Chris before writing.
8. **Record what you set** (never a secret) in `docs/manual-setup.md` next to each
   item, and open a pull request only if Chris asks.

## The blocker you cannot fix alone: the `magic_link` template

Guest sign-in emails go out through the Supabase Send Email hook, which needs
a `magic_link` email template registered in `emails/index.ts`. That file is
empty on purpose: email content is supplied by someone else and the repo's
rules forbid writing subject lines, copy or designs. Until a template exists:

- keep the Send Email hook off (the hook returns an error without a template);
- guests cannot be sent working sign-in links, because the built-in sender only
  reaches organization members.

Options to put to Chris (do not choose for them):

- wait for the supplied template;
- ask permission to write a plain placeholder `magic_link` template, which the
  repo's rules otherwise forbid;
- point Supabase's own sign-in emails at Resend through custom SMTP (Resend
  documents SMTP with the username `resend` and the API key as the password;
  verify the host and ports against Resend's current docs). This would send
  Supabase's default sign-in email wording, which is also email content, so it
  still needs Chris's say.

Campaign emails (invitations, reminders) have the same dependency: each message
type needs its own registered template, or the send is refused with a plain
message. That is by design.

## Facts you will need

- Repository: `cmhac/wedding-website`. The default branch is `main`. Merging to
  `main` deploys the site on Vercel and applies new migrations to the hosted
  database automatically.
- Vercel: project `wedding-website`, id `prj_rPeRgtRW1YCfQPWX7pZLsatJqOcL`, team
  `team_JWoc2UeuwDeznYpkbi808p9P`. Token in `VERCEL_ACCESS_TOKEN`. The token can
  read the project and change its domains and environment variables, but cannot
  list the account's domains or teams.
- Supabase: project ref `vwhgwmvbzyzeawrzduqs`. Token in `SUPABASE_ACCESS_TOKEN`.
  The organization is the one the Vercel integration created, and the token
  cannot list its members. Use read-only SQL (`"read_only": true`) for checks.
- Local development: needs Docker. If `docker info` fails, the daemon is
  installed but may not be running; start it with `dockerd` (detached), remove a
  stale `/var/run/docker.pid` if it refuses, then `npm run db:start`.
  `npm run dev` rewrites `AGENTS.md` (a Next.js feature); run
  `git checkout AGENTS.md` before committing.
- The sign-in routes keep an in-memory per-address limit (3 requests per 10
  minutes), so repeated local tests need a dev-server restart.
- Checks before pushing: `npm run format:check && npm run lint && npm run
type-check && npm test`. The database tests are `npm run test:db`.

## Known gaps to remember

These are recorded in `specs/002-admin-console-v0/data-model.md` under "Gaps
found": the importer duplicates a paper-only household if the same file is
imported twice; a removed staff member's old records read "Staff (former
member)" without a role; the after-send screens and a keyboard-only pass were not
walked by hand; borders on inputs are low contrast. The admin console is a
temporary stand-in that the designer's version will replace.
