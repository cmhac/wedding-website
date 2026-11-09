# 0012: Shared household access

Status: accepted (2026-11-09). Supersedes the "exactly one responder" part of
[0006](./0006-household-model.md); the rest of that decision stands.

A household can have several email addresses, and any person signed in to the
household can read and answer for all of it. There is no longer a single
"responder". Every address in a household gets each invitation and reminder (one
email per address, each carrying the household's personal link), an address
belongs to at most one household, and a household with no address is paper only.
Guests can see their household's addresses, masked, but only staff change them.
Concurrent saves from two people end in a consistent state: each save is one
transaction and the last save wins per field, with every change in the history.

Why: couples and families share one RSVP and want the invitation to reach each
person who will act on it, not just one inbox.

Alternatives: one responder with a "primary" address plus extra ones (two sources
of truth for every reader); an array column (no per-address uniqueness or
delivery flag).

Consequences: delivery problems (bounces and complaints) are tracked per
address, and the household's flag follows its addresses. Staff addresses cannot
be household addresses, in either direction. Details:
`specs/003-personal-invite-links/data-model.md`.
