# Manual setup and settings

Everything here is configured by hand in a dashboard, because it cannot be done
from code. The tracking issue is https://github.com/cmhac/wedding-website/issues/3.
Record the final value (never a secret) next to each item when you set it.
Never put a secret in this repository.

## Supabase Auth

| Setting                    | Where                                          | Value                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email provider             | Dashboard, Authentication, Providers           | **Enabled and must stay enabled.** If it is turned off, magic links stop working.                                                                                                                                                                                                                                                                                                                     |
| Allow new users to sign up | Dashboard, Authentication, Sign In / Providers | **Off.** Locally this is `[auth] enable_signup = false` in `supabase/config.toml`.                                                                                                                                                                                                                                                                                                                    |
| Per-request guard          | `signInWithOtp` calls in the sign-in routes    | `shouldCreateUser: false` (already in code), so a sign-in request can never create a user.                                                                                                                                                                                                                                                                                                            |
| Confirm email              | Authentication, Providers, Email               | Off (`enable_confirmations = false`); users are created by server code, not by sign-up.                                                                                                                                                                                                                                                                                                               |
| Site URL                   | Authentication, URL Configuration              | The production site URL.                                                                                                                                                                                                                                                                                                                                                                              |
| Redirect URLs              | Authentication, URL Configuration              | The production `/auth/callback` URL **and** `/auth/callback?audience=staff` (the staff sign-in link; Supabase matches the allow-list exactly, query string included). Locally both are in `additional_redirect_urls` in `supabase/config.toml`.                                                                                                                                                       |
| Send Email hook            | Authentication, Hooks, Send Email              | HTTPS hook pointing at `<site>/api/auth/send-email`, with its secret saved as `SEND_EMAIL_HOOK_SECRET` on the host. Now that `magic_link` is registered in `emails/index.ts`, turn it on following "Switching sign-in email to the repository's template" below. It carries **staff** sign-in email only: guests' links are sent by the site (see Sign-in rate limiting). Locally the hook stays off. |

Why the email provider stays on while sign-ups are off: in Supabase the
`[auth.email] enable_signup` flag switches the email provider itself on or off
(magic links need it on). New accounts are blocked by the separate project-wide
`[auth] enable_signup = false` plus `shouldCreateUser: false`. Both guards
together mean only server code (the household create endpoint and
`scripts/create-staff-user.ts`) creates users. See
`docs/decisions/0003-guest-identity.md` and `docs/decisions/0004-auth-emails-via-resend.md`.

## Household sessions stay signed in

Guests open their personal link once and stay signed in on that device, so the
Supabase Auth session limits must stay **unset** (dashboard, Authentication,
Sessions): no "time-box user sessions" and no "inactivity timeout". Setting
either would sign guests out and force them to ask for a new link. Staff
sessions follow the same project settings.

Check it through the Management API (needs a personal access token with
`auth_config_read`; the token is never stored in the repository):

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/<project-ref>/config/auth" \
  | jq '{sessions_timebox, sessions_inactivity_timeout}'
```

Both fields must be empty or zero. Supabase documents both settings, and says
sessions are not ended the moment a limit is reached, in
[its sessions guide](https://supabase.com/docs/guides/auth/sessions) and the
[auth config reference](https://supabase.com/docs/reference/api/v1-get-auth-service-config).
Record the date you checked here: _not checked yet_.

## Sign-in rate limiting

Two layers sit in front of sign-in:

- **Guest sign-in (`/api/guest/sign-in`).** The site sends the emailed link
  itself, so Supabase's per-email limit no longer applies to guests. A durable
  limit in the database does the job instead: by default 3 links per address per
  10 minutes and 60 links an hour overall, kept in `sign_in_attempts` (only a
  keyed hash of the address, never the address; rows older than a day are
  cleared by the scheduled job). Change the three numbers in the admin console,
  Settings, "Limits on sign-in emails", with no code change. A request over a
  limit gets the same neutral `202` answer and sends nothing. The hash is keyed
  with `INVITE_LINK_SECRET`, so changing that secret resets the per-address
  counts.
- **Per client address, in memory.** Both sign-in routes (`/api/guest/sign-in`,
  `/api/admin/sign-in`) keep an in-memory limiter per client address. It is
  **best effort only**: it lives in one server instance's memory, so it resets
  on a restart and is not shared between instances or serverless invocations.
  The client address comes from `x-real-ip`, then the rightmost
  `x-forwarded-for` hop (never the leftmost, which a caller can forge); check
  that the host overwrites or appends these headers.

**Staff sign-in** is still sent by Supabase, so its own per-email limit
(Authentication, Rate Limits; locally `[auth.email] max_frequency` and
`[auth.rate_limit]` in `supabase/config.toml`) is the control there. Keep it on,
and review it before launch. Every valid sign-in request also takes at least
1.5 seconds, so the response time does not reveal whether an address is known.

## Personal invite links

| Item                             | Where                                   | Value                                                                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVITE_LINK_SECRET`             | Vercel, Environment Variables           | A long random string, **sensitive**, production and preview. It keys every personal link and the sign-in limit hashes. Changing it breaks every link already sent, so set it once, before invitations go out, and keep a copy in the couple's password manager.   |
| `HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN` | Vercel, Environment Variables           | Optional; default `households.invalid`. Each household's sign-in account has the address `household-<household id>@<domain>`, which is never mailed. If Supabase ever refuses `.invalid`, use a subdomain of the site that has no mail records.                   |
| Wedding event                    | Admin console, Settings                 | **Choose it.** Personal links stop working on that event's date (Pacific time); typed-address sign-in and sessions already open keep working. Until it is chosen the links never close, and the overview shows a warning.                                         |
| Sign-in limits                   | Admin console, Settings                 | Defaults above; change them there.                                                                                                                                                                                                                                |
| Converting existing accounts     | `scripts/convert-household-accounts.ts` | Only if any household was created before this feature: `node --env-file=.env.local scripts/convert-household-accounts.ts` renames each household's sign-in account to the synthetic address. It is safe to run twice and prints counts only. Production had none. |

A household's personal link is shown (to copy) and can be reissued on its page
in the admin console. "Sign out everywhere" there ends every session of the
household at once.

## Resend

| Item           | Where            | Value                                                                                                                                                            |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sending domain | Resend, Domains  | Verify one domain (DNS records) before any production send. Record the domain and verification date in `docs/decisions/0007-sending-domain.md`.                  |
| API key        | Resend, API Keys | Saved as `RESEND_API_KEY` on the host (server-only).                                                                                                             |
| From address   | n/a              | `EMAIL_FROM`, an address on the verified domain.                                                                                                                 |
| Webhook        | Resend, Webhooks | Endpoint `<site>/api/webhooks/resend` for `email.sent`, `email.delivered`, `email.bounced`, `email.complained`. Signing secret saved as `RESEND_WEBHOOK_SECRET`. |

### Production state (set 2026-10-29)

- Sending domain `updates.hannahandchris.wedding` (region `us-east-1`), verified
  2026-10-29. DNS records live in Vercel DNS: a DKIM text record on
  `resend._domainkey.updates`, a mail-exchange and an SPF text record on
  `send.updates`, and a tracking CNAME on `rsend.updates`.
- Webhook created for the production endpoint with the four events above.
- Production variables set as sensitive: `RESEND_API_KEY` (a sending-only key
  made for the verified domain), `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`
  (`Chris & Hannah <hello@updates.hannahandchris.wedding>`) and `CRON_SECRET`.
  They take effect after the next production redeploy.
- **Stopgap, to be retired** (see the switch-over below): Supabase Auth sends
  its sign-in emails through Resend over custom SMTP (host `smtp.resend.com`,
  port 465, username `resend`, the sending-only key as the password), from
  `Chris & Hannah <hello@updates.hannahandchris.wedding>`. The hourly cap on
  emails sent is 30 (it was 2 with the built-in sender). The sign-in email
  wording is the one already set in Supabase's auth settings.
- Still off: the Supabase Send Email hook, and so `SEND_EMAIL_HOOK_SECRET`,
  until the switch-over below is done.

### Switching sign-in email to the repository's template

The `magic_link` template is now registered (a first draft for Chris to polish),
so the temporary custom SMTP can be retired. Do these in order, so there is no
gap in sign-in email:

1. Deploy with `magic_link` registered and `INVITE_LINK_SECRET` set.
2. In Vercel, set `SEND_EMAIL_HOOK_SECRET` (the secret Supabase shows when the
   hook is created) and redeploy.
3. In Supabase, Authentication, Hooks, turn on **Send Email**, pointing at
   `<site>/api/auth/send-email`.
4. Sign in to `/admin` once. The email must arrive rendered from the repository's
   template (its subject mentions the admin console), not Supabase's wording.
   Do not go on until it does.
5. Only then remove the custom SMTP settings from Supabase Auth.
6. Record what was done and when: _not done yet_.

After this, guests' sign-in emails (typed address) are sent by the site through
Resend and staff sign-in emails go through the hook; Supabase's own email
wording is never sent.

## Supabase Vault (scheduled sends)

Created in production on 2026-10-29: `site_url` (the production site address)
and `cron_secret` (the same value as `CRON_SECRET`).

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

| Variable                        | Visibility  | Notes                                                                                                                                                    |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`          | public      | Production site URL                                                                                                                                      |
| `NEXT_PUBLIC_SUPABASE_URL`      | public      | Supabase project URL                                                                                                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public      | Supabase anon key                                                                                                                                        |
| `SUPABASE_SERVICE_ROLE_KEY`     | server-only | Bypasses row-level security                                                                                                                              |
| `RESEND_API_KEY`                | server-only |                                                                                                                                                          |
| `EMAIL_FROM`                    | server-only | Address on the verified domain                                                                                                                           |
| `SEND_EMAIL_HOOK_SECRET`        | server-only | Matches the Supabase Send Email hook secret                                                                                                              |
| `RESEND_WEBHOOK_SECRET`         | server-only | Matches the Resend webhook signing secret                                                                                                                |
| `CRON_SECRET`                   | server-only | Matches the `cron_secret` Vault secret                                                                                                                   |
| `TWILIO_ACCOUNT_SID`            | server-only | Text messages. Texting is off and hidden until the four Twilio variables are set (see "Twilio text messages")                                            |
| `TWILIO_AUTH_TOKEN`             | server-only | Also checks Twilio's delivery notifications                                                                                                              |
| `TWILIO_MESSAGING_SERVICE_SID`  | server-only | The messaging service the approved campaign is attached to (or set `TWILIO_FROM_NUMBER`, the sending number, instead)                                    |
| `GUEST_RSVP_PATH`               | public      | Where signed-in guests land; default `/` (the placeholder homepage). Not set in production; set it to the RSVP path when the designer's RSVP page exists |

## Twilio text messages

Text messages are off and invisible until you finish this, and the admin console
shows a warning banner ("Text messaging is not set up") until the variables are
set. Sign-in and every email work meanwhile. Do these in order. The design is in
`docs/decisions/0014-text-messages.md`.

1. **Check you qualify.** A sole-proprietor registration is for people with no
   business tax number (no EIN) who file taxes under their own Social Security
   number. With a tax number, register a standard brand instead.
2. **Create a Twilio account and upgrade it.** The free trial only texts
   verified numbers and has one sender.
3. **Buy a United States local number** (about $1.15 a month). Every number must
   be tied to an approved compliance profile, which the console walks you through.
4. **Register the brand.** In the console: Communications, Numbers and senders,
   Overview, Phone Numbers, then "Complete A2P registration". Use your own name as
   the brand. You will need a valid non-disposable email, an address (a personal
   one is fine) and a US or Canadian mobile number that is not a Twilio number;
   Twilio texts it a code that you must answer within 24 hours.
5. **Register the campaign** (use case "Sole Proprietor"): a detailed
   description that matches the sample texts; how guests agree to texts and
   proof of it (the sign-in checkbox and consent step; screenshots of the live
   pages, viewable without a login); the live `/privacy` and `/terms` links;
   and at least two sample texts that name the wedding site and include "STOP".
   Describe only what the site really does. Twilio says a non-compliant opt-in
   description is the most common reason for rejection; a rejected campaign can be
   fixed and resubmitted (edit it rather than creating a new one). Approval takes
   up to about five business days. The fees are about $4 for the brand, $15 for
   campaign vetting and $2 a month for the campaign: confirm them on the console's
   fee screen.
6. **Set the variables on the host and redeploy:** `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` (or
   `TWILIO_FROM_NUMBER`). They are server-only; never put them in the repository.
   After the redeploy the banner disappears and Settings shows "Text messaging".
7. **Delivery notifications need no setup if you leave the messaging
   service's own callback URL blank**: the site sets `<site>/api/webhooks/twilio`
   on each text it sends, and checks Twilio's signature with `TWILIO_AUTH_TOKEN`.
   Twilio signs the exact URL it calls, so if you do set a callback URL anywhere
   it must be exactly that (same host, no trailing slash), or every notification
   will be refused.
8. **Turn texting on** in Settings, as a couple member. This texts nobody by
   itself: guests are asked to opt in at their next sign-in, and only numbers that
   opted in are ever texted. Keep it off until the carriers have approved the
   campaign.

To test without sending anything, use Twilio's test credentials with the magic
sender `+15005550006` (it returns a fake message id and delivers nothing).

## The save the date outreach

1. **Consent collected outside the site.** If you mark numbers as consented (one
   at a time, in a batch, or with the import's consent column), the carrier
   registration's description of how people opt in has to cover how that consent
   was really collected, and you should keep your own copy of the evidence (the
   note field on each mark is for pointing at it). Twilio accepts several routes
   (a consent form on a website or app, a signed paper document, a text keyword,
   or a verbal opt-in with a detailed script) and says consent applies per
   campaign. The privacy and terms pages are locked and describe only the
   on-site tick, so decide how to reconcile them before the first text goes out
   (see decision 0015).
2. **Confirm the email sending domain is verified** at Resend. The readiness
   list can only see that the key and sending address are set, not that the
   domain is verified.
3. **Close the RSVP** in Settings until invitations go out, unless you want
   guests who open the save the date to be able to answer.
4. **Register the save the date email.** The wording and design come from the
   couple or the designer and go in `emails/index.ts` under `save_the_date`;
   until then a campaign that includes email is refused, and a text-only send
   works.
5. **Rehearse.** On a save the date campaign, use "Send a test" for your own
   household, open the links on a phone, and add the date to Google Calendar,
   Outlook and Apple Calendar (the steps are in
   `specs/006-save-the-date-outreach/quickstart.md`). Whether Apple Calendar
   and Outlook replace an earlier entry when you re-download the file after a
   change is not documented by either, so try it.
6. **Schedule the send** for the day the cards are posted, between 11 a.m. and
   9 p.m. Eastern so every guest in the continental United States gets a text
   inside 8 a.m. to 9 p.m. their time (the console warns otherwise).

## Staff accounts

Create the first couple account with `scripts/create-staff-user.ts` (see the
README). Sign-in never creates staff.
