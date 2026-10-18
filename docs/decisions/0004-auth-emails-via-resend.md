# 0004: Auth emails through Resend

Status: proposed (2026-10-18)

Supabase's Send Email auth hook (HTTPS) calls `POST /api/auth/send-email`, which
verifies the hook signature and sends the magic-link email through Resend using the
registered `magic_link` template (the email content is supplied separately; the
hook stays disabled in production until one exists).

Why: one sending domain and one set of designs for auth and invitation emails,
and no dependence on Supabase's built-in email rate limit.

Alternative: custom SMTP under `[auth.email.smtp]`. It is simpler but the
magic-link email would not go through the template registry.
