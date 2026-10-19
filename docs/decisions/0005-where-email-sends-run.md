# 0005: Where email sends run

Status: proposed (2026-10-18)

Sends run in Next.js route handlers, not Supabase Edge Functions. "Send now" is a
staff-only route; scheduled sends are picked up by `pg_cron` calling a
secret-protected route via `pg_net` every five minutes.

Why: template modules (supplied by others), the Resend client, and Jest tests share one Node runtime; Edge
Functions run on Deno. Sends are idempotent (a unique row per campaign and
household, and a Resend idempotency key), so retries and missed or repeated cron
runs are safe.

Revisit if sends need to be triggered by database events rather than by staff
actions or the schedule.
