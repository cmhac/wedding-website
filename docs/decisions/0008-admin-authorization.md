# 0008: Admin authorization

Status: proposed (2026-10-18)

A `staff` table lists staff users with role `couple` or `planner`. Row-level
security uses a security-definer `is_staff()` helper. Couple and planner have
the same data access; only `couple` rows can edit `staff`, and no change may
leave zero `couple` rows. Staff Auth users are created by script, not by
sign-up.

Why: the couple want the planner to have full access, with changes attributed to
them and revocation effective on the next request. A table lookup is current on
every request, unlike custom JWT claims, which stay stale until the token
refreshes.
