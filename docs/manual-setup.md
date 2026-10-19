# Manual setup and settings

Everything here is configured by hand in a dashboard, because it cannot be done
from code. The tracking issue is https://github.com/cmhac/wedding-website/issues/3.
Record the final value (never a secret) next to each item when you set it.
Never put a secret in this repository.

## Supabase Auth

| Setting                    | Where                                          | Value                                                                                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email provider             | Dashboard, Authentication, Providers           | **Enabled and must stay enabled.** If it is turned off, magic links stop working.                                                                                                                                                                                              |
| Allow new users to sign up | Dashboard, Authentication, Sign In / Providers | **Off.** Locally this is `[auth] enable_signup = false` in `supabase/config.toml`.                                                                                                                                                                                             |
| Per-request guard          | `signInWithOtp` calls in the sign-in routes    | `shouldCreateUser: false` (already in code), so a sign-in request can never create a user.                                                                                                                                                                                     |
| Confirm email              | Authentication, Providers, Email               | Off (`enable_confirmations = false`); users are created by server code, not by sign-up.                                                                                                                                                                                        |
| Site URL                   | Authentication, URL Configuration              | The production site URL.                                                                                                                                                                                                                                                       |
| Redirect URLs              | Authentication, URL Configuration              | The production `/auth/callback` URL.                                                                                                                                                                                                                                           |
| Send Email hook            | Authentication, Hooks, Send Email              | HTTPS hook pointing at `<site>/api/auth/send-email`, with its secret saved as `SEND_EMAIL_HOOK_SECRET` on the host. Enable it only after a `magic_link` template is registered in `emails/index.ts`; until then Supabase's built-in email is used. Locally the hook stays off. |

Why the email provider stays on while sign-ups are off: in Supabase the
`[auth.email] enable_signup` flag switches the email provider itself on or off
(magic links need it on). New accounts are blocked by the separate project-wide
`[auth] enable_signup = false` plus `shouldCreateUser: false`. Both guards
together mean only server code (the household create endpoint and
`scripts/create-staff-user.ts`) creates users. See
`docs/decisions/0003-guest-identity.md` and `docs/decisions/0004-auth-emails-via-resend.md`.

## Resend

| Item           | Where            | Value                                                                                                                                                            |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sending domain | Resend, Domains  | Verify one domain (DNS records) before any production send. Record the domain and verification date in `docs/decisions/0007-sending-domain.md`.                  |
| API key        | Resend, API Keys | Saved as `RESEND_API_KEY` on the host (server-only).                                                                                                             |
| From address   | n/a              | `EMAIL_FROM`, an address on the verified domain.                                                                                                                 |
| Webhook        | Resend, Webhooks | Endpoint `<site>/api/webhooks/resend` for `email.sent`, `email.delivered`, `email.bounced`, `email.complained`. Signing secret saved as `RESEND_WEBHOOK_SECRET`. |

## Supabase Vault (scheduled sends)

The five-minute `pg_cron` job reads two secrets from Vault; if either is absent
the job skips quietly (local development). In the SQL editor of the production
project:

```sql
select vault.create_secret('https://<production site>', 'site_url');
select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
```

## Hosting variables

The host must run Next.js server code on a supported Node version
(`docs/decisions/0002-hosting.md`). Set these on the host; the server-only ones
are never prefixed with `NEXT_PUBLIC_` and never exposed to the browser.

| Variable                        | Visibility  | Notes                                           |
| ------------------------------- | ----------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`          | public      | Production site URL                             |
| `NEXT_PUBLIC_SUPABASE_URL`      | public      | Supabase project URL                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public      | Supabase anon key                               |
| `SUPABASE_SERVICE_ROLE_KEY`     | server-only | Bypasses row-level security                     |
| `RESEND_API_KEY`                | server-only |                                                 |
| `EMAIL_FROM`                    | server-only | Address on the verified domain                  |
| `SEND_EMAIL_HOOK_SECRET`        | server-only | Matches the Supabase Send Email hook secret     |
| `RESEND_WEBHOOK_SECRET`         | server-only | Matches the Resend webhook signing secret       |
| `CRON_SECRET`                   | server-only | Matches the `cron_secret` Vault secret          |
| `GUEST_RSVP_PATH`               | public      | Path the guest frontend serves; default `/rsvp` |

## Staff accounts

Create the first couple account with `scripts/create-staff-user.ts` (see the
README). Sign-in never creates staff.
