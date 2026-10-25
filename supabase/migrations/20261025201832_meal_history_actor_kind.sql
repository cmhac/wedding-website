-- Record whether a meal change was made by a couple member, a planner, a guest
-- or the system, as rsvp_history already does. The functions and triggers that
-- write meal history name their columns, so the default fills the new one and
-- none of them changes.

-- Added empty first. Adding the column with the default in one statement would
-- fill every existing row with `system` (nobody is signed in during a migration).
alter table public.meal_selection_history
  add column actor_kind text check (actor_kind in ('couple', 'planner', 'guest', 'system'));

-- Only afterwards does the default apply, to rows written from now on.
alter table public.meal_selection_history
  alter column actor_kind set default public.current_actor_kind();

comment on column public.meal_selection_history.actor_kind is
  'Whether the account that made the change was a couple member, planner, guest or the system. Empty for rows written before this column was added.';
