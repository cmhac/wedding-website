# 0011: Household sign-in and personal invite links

Status: accepted (2026-11-09). Supersedes [0003](./0003-guest-identity.md).

Each household still has exactly one Supabase Auth user, created by server code
with the service-role key and linked as `households.auth_user_id`, but the
user's address is now a **synthetic, never-mailed** one,
`household-<household id>@households.invalid` (the domain is set by
`HOUSEHOLD_ACCOUNT_EMAIL_DOMAIN`). The household's real addresses live in
`household_contacts`. Guests get in two ways, both turned into a Supabase
session by the site:

- **A personal link**, `/i/<household id>.<signature>`. It is derived, not
  stored: an HMAC of the household id and a per-household link version, keyed
  with `INVITE_LINK_SECRET`. Opening it asks Supabase for a single-use sign-in
  token for the household's user (`generateLink`, which sends nothing), exchanges
  it for a session (`verifyOtp`), and redirects to the RSVP. Reissuing a link
  increments the version, so the old link stops at once. Links close on the wedding
  day.
- **A typed address.** The sign-in route looks the address up in
  `household_contacts` and the site, not Supabase, emails a link to exactly that
  address, rendered from the `magic_link` template.

Open sign-up stays off project-wide (`enable_signup = false`), and
`shouldCreateUser: false` still applies to staff sign-in. "Sign out everywhere"
deletes the household user's sessions, and guest access additionally checks that
the access token's session still exists, so it takes effect on the next request.

Why: a household has several addresses and Supabase allows one per user, so tying
the account to any one real address would make removing that address delete or
rename the account; keeping real addresses out of `auth.users` also means
Supabase can never email a guest directly. A derived link can be put in every
invitation and copied by staff without storing anything secret, so a database
leak reveals no working link.

Alternatives: one Auth user per address (breaks "one shared account per
household"); a fully custom session system (re-implements security-critical
code); a random token stored as a hash (cannot be re-sent or copied); deleting
and recreating the user to sign a household out (erases who answered each RSVP).

Consequences: typed-address links are single use and short lived (a mail scanner
that opens one first uses it up; the guest asks again or uses the personal link).
Durable sign-in limits live in the database, keyed by a hash of the address.
Details: `specs/003-personal-invite-links/research.md`.
