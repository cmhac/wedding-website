# 0003: Guest identity model

Status: accepted (2026-10-19)

One Supabase Auth user is created per household (the responder) by server code
using the service-role key, and linked as `households.auth_user_id`. Guests sign
in with `signInWithOtp` and `shouldCreateUser: false`. Open sign-up is turned
off in `supabase/config.toml`.

Why: the couple chose one responder per household. Open sign-up plus matching by
email would let strangers create accounts.

Consequences:

- Contact emails are unique across households; two households cannot share one.
- The sign-in endpoint returns the same neutral message whether or not the address
  is on the guest list, because an unregistered address returns an error that
  would otherwise reveal list membership.

Alternatives: open sign-up with email matching; signed per-household links with
no Auth user.
