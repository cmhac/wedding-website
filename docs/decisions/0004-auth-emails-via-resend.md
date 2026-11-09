# 0004: Auth emails through Resend

Status: accepted (2026-10-19)

Supabase's Send Email auth hook (HTTPS) calls `POST /api/auth/send-email`, which
verifies the hook signature and sends the magic-link email through Resend using the
registered `magic_link` template (the email content is supplied separately; the
hook stays disabled in production until one exists).

Why: one sending domain and one set of designs for auth and invitation emails,
and no dependence on Supabase's built-in email rate limit.

Alternative: custom SMTP under `[auth.email.smtp]`. It is simpler but the
magic-link email would not go through the template registry.

## Update 2026-10-29: temporary custom SMTP, hook remains the plan

Chris confirmed the requirement: guest and staff sign-in emails must look like
the website and the invitations, and their code must live in this repository
(the template registry in `emails/index.ts`), not in Supabase's dashboard
settings. So the Send Email hook above stays the long-term design, and the
alternative of custom SMTP was not adopted as the end state.

Until a `magic_link` template is registered, production runs a stopgap so that
sign-in links reach real guests: Supabase's custom SMTP points at Resend, and
Supabase's own sign-in email wording (set in its auth settings) is what goes
out. The hook stays off. When the template exists: register it, turn the hook
on, and remove the custom SMTP settings. Until then, the sign-in email does not
match the site and invitations.

## Update 2026-11-09: guests' sign-in email is sent by the site; the hook carries staff email only

The personal-invite-links work (`specs/003-personal-invite-links`) changed who
sends what. A household has several email addresses and one shared sign-in
account, so a guest who types an address now gets a link from the site itself:
the sign-in route looks the address up, asks Supabase for a single-use token
without sending anything, renders the registered `magic_link` template with
`audience: "guest"`, and sends it through Resend to exactly the address typed.
The Send Email hook therefore only ever carries **staff** sign-in email. The
decision stands that all of it comes from templates in this repository and goes
through Resend; the first-draft `magic_link`, `invitation` and `rsvp_reminder`
templates are registered, and `docs/manual-setup.md` has the ordered switch-over
from the temporary custom SMTP to the hook.
