-- Audit log and RSVP history. Neither holds names, emails, or any value: the
-- audit log records which columns changed, the history records status changes
-- keyed by ids that go null when the guest or event is deleted.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('couple', 'planner', 'guest', 'system')),
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_fields text[]
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create table public.rsvp_history (
  id bigint generated always as identity primary key,
  guest_id uuid references public.guests (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  old_status public.rsvp_status,
  new_status public.rsvp_status not null,
  changed_by uuid,
  actor_kind text not null check (actor_kind in ('couple', 'planner', 'guest', 'system')),
  changed_at timestamptz not null default now()
);

create index rsvp_history_guest_id_idx on public.rsvp_history (guest_id);

-- Who is making this change: the signed-in user's staff role, `guest` for any
-- other signed-in user, `system` when nobody is signed in (migrations, seeds,
-- service-role jobs).
create function public.current_actor_kind()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'system'
    else coalesce(
      (select role::text from public.staff where user_id = auth.uid()),
      'guest'
    )
  end;
$$;

revoke execute on function public.current_actor_kind() from public, anon;
grant execute on function public.current_actor_kind() to authenticated, service_role;

-- Generic audit trigger. Pass the name of the column that identifies the row
-- (default `id`); invitations are identified by their guest. Column names only,
-- never values: inserts list the columns that were filled in, updates list the
-- columns whose value changed (ignoring updated_at), deletes list none.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_column text := coalesce(tg_argv[0], 'id');
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  fields text[];
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(key order by key), '{}') into fields
      from jsonb_each(new_row) where value <> 'null'::jsonb;
  elsif tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into fields
      from jsonb_each(new_row) n
      where n.key <> 'updated_at' and n.value is distinct from old_row -> n.key;
  else
    fields := '{}';
  end if;

  insert into public.audit_log (actor_user_id, actor_kind, entity, entity_id, action, changed_fields)
  values (
    auth.uid(),
    public.current_actor_kind(),
    tg_table_name,
    (coalesce(new_row, old_row) ->> id_column)::uuid,
    lower(tg_op),
    fields
  );
  return null;
end;
$$;

create trigger households_audit
  after insert or update or delete on public.households
  for each row execute function public.audit_row_change();
create trigger guests_audit
  after insert or update or delete on public.guests
  for each row execute function public.audit_row_change();
create trigger invitations_audit
  after insert or update or delete on public.invitations
  for each row execute function public.audit_row_change('guest_id');
create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.audit_row_change();
create trigger staff_audit
  after insert or update or delete on public.staff
  for each row execute function public.audit_row_change('user_id');

-- Every invitation status change is kept, with who made it.
create function public.record_rsvp_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rsvp_history (guest_id, event_id, old_status, new_status, changed_by, actor_kind)
  values (new.guest_id, new.event_id, old.status, new.status, auth.uid(), public.current_actor_kind());
  return null;
end;
$$;

create trigger invitations_rsvp_history
  after update of status on public.invitations
  for each row
  when (old.status is distinct from new.status)
  execute function public.record_rsvp_history();

-- Staff may read; nobody writes directly (the triggers above run as definer).
alter table public.audit_log enable row level security;
alter table public.rsvp_history enable row level security;

revoke all on public.audit_log, public.rsvp_history from anon, authenticated;
grant select on public.audit_log, public.rsvp_history to authenticated;

create policy audit_log_staff_select on public.audit_log
  for select to authenticated using (public.is_staff());
create policy rsvp_history_staff_select on public.rsvp_history
  for select to authenticated using (public.is_staff());
