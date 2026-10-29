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
