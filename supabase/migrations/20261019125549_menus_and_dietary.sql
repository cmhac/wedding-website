-- Menus, dietary categories, guests' dietary needs, and meal selections.

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  status public.menu_status not null default 'draft',
  notes text
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus (id) on delete cascade,
  name text not null,
  display_order smallint,
  requires_choice boolean not null default true
);

create index courses_menu_id_idx on public.courses (menu_id);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null,
  description text,
  archived_at timestamptz,
  -- Lets meal_selections prove a dish belongs to the course it was chosen for.
  unique (id, course_id)
);

create index dishes_course_id_idx on public.dishes (course_id);

-- One vocabulary for dish tags and guest restrictions (research decision on
-- menus and restrictions). For a `diet` category a dish tag means "suitable
-- for"; for an `allergen` category it means "contains".
create table public.dietary_categories (
  key text primary key,
  label text not null,
  kind public.dietary_kind not null,
  display_order smallint
);

create table public.dish_tags (
  dish_id uuid not null references public.dishes (id) on delete cascade,
  category_key text not null references public.dietary_categories (key) on update cascade,
  primary key (dish_id, category_key)
);

create table public.guest_dietary (
  guest_id uuid not null references public.guests (id) on delete cascade,
  category_key text not null references public.dietary_categories (key) on update cascade,
  severity text not null check (severity in ('allergy', 'preference')),
  details text,
  primary key (guest_id, category_key)
);

create table public.meal_selections (
  guest_id uuid not null references public.guests (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  dish_id uuid not null,
  chosen_at timestamptz not null default now(),
  chosen_by uuid references auth.users (id) on delete set null,
  primary key (guest_id, course_id),
  -- The dish must belong to the course it was chosen for.
  foreign key (dish_id, course_id) references public.dishes (id, course_id)
);

create index meal_selections_course_id_idx on public.meal_selections (course_id);

-- Every choice, change, removal and archive is kept, with no names or emails.
create table public.meal_selection_history (
  id bigint generated always as identity primary key,
  guest_id uuid references public.guests (id) on delete set null,
  course_id uuid references public.courses (id) on delete set null,
  old_dish_id uuid references public.dishes (id) on delete set null,
  new_dish_id uuid references public.dishes (id) on delete set null,
  reason text not null check (reason in ('changed', 'declined', 'dish_archived')),
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index meal_selection_history_guest_id_idx on public.meal_selection_history (guest_id);

-- Standard categories. The couple can add more.
insert into public.dietary_categories (key, label, kind, display_order) values
  ('vegetarian', 'Vegetarian', 'diet', 1),
  ('vegan', 'Vegan', 'diet', 2),
  ('gluten-free', 'Gluten-free', 'diet', 3),
  ('dairy-free', 'Dairy-free', 'diet', 4),
  ('halal', 'Halal', 'diet', 5),
  ('kosher', 'Kosher', 'diet', 6),
  ('nuts', 'Tree nuts', 'allergen', 10),
  ('peanuts', 'Peanuts', 'allergen', 11),
  ('shellfish', 'Shellfish', 'allergen', 12),
  ('eggs', 'Eggs', 'allergen', 13),
  ('fish', 'Fish', 'allergen', 14),
  ('milk', 'Milk', 'allergen', 15),
  ('soy', 'Soy', 'allergen', 16),
  ('wheat', 'Wheat', 'allergen', 17),
  ('sesame', 'Sesame', 'allergen', 18),
  ('mustard', 'Mustard', 'allergen', 19),
  ('celery', 'Celery', 'allergen', 20),
  ('sulphites', 'Sulphites', 'allergen', 21);

-- Selection rules. A choice needs an attending invitation to the course's
-- event, a published menu (staff and system writes may use any status), and a
-- dish that is not archived. The dish-belongs-to-course rule is the composite
-- foreign key above.
create function public.meal_selections_enforce_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_menu_status public.menu_status;
  v_archived timestamptz;
begin
  select m.event_id, m.status into v_event, v_menu_status
    from public.courses c join public.menus m on m.id = c.menu_id
   where c.id = new.course_id;

  if not exists (
    select 1 from public.invitations i
     where i.guest_id = new.guest_id and i.event_id = v_event and i.status = 'attending'
  ) then
    raise exception 'invalid_meal' using errcode = 'P0001';
  end if;

  if auth.uid() is not null and not public.is_staff() and v_menu_status <> 'published' then
    raise exception 'invalid_meal' using errcode = 'P0001';
  end if;

  select d.archived_at into v_archived from public.dishes d where d.id = new.dish_id;
  if v_archived is not null then
    raise exception 'invalid_meal' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    new.chosen_at := now();
  end if;
  return new;
end;
$$;

create trigger meal_selections_enforce_rules
  before insert or update of guest_id, course_id, dish_id on public.meal_selections
  for each row execute function public.meal_selections_enforce_rules();

-- A first choice or a change of dish is written to the history.
create function public.meal_selections_record_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.meal_selection_history (guest_id, course_id, old_dish_id, new_dish_id, reason, changed_by)
  values (
    new.guest_id, new.course_id,
    case when tg_op = 'UPDATE' then old.dish_id end,
    new.dish_id, 'changed', auth.uid()
  );
  return null;
end;
$$;

create trigger meal_selections_record_history_insert
  after insert on public.meal_selections
  for each row execute function public.meal_selections_record_history();
create trigger meal_selections_record_history_update
  after update of dish_id on public.meal_selections
  for each row
  when (old.dish_id is distinct from new.dish_id)
  execute function public.meal_selections_record_history();

-- Removes a guest's choices for one event, keeping them in the history. Rows
-- are only written for guests, courses and dishes that still exist, so a
-- cascading delete of a guest or an event never trips a foreign key.
create function private.remove_meal_selections(p_guest_id uuid, p_event_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.meal_selections ms
     using public.courses c, public.menus m
     where ms.guest_id = p_guest_id
       and ms.course_id = c.id and c.menu_id = m.id and m.event_id = p_event_id
    returning ms.guest_id, ms.course_id, ms.dish_id
  )
  insert into public.meal_selection_history (guest_id, course_id, old_dish_id, new_dish_id, reason, changed_by)
  select r.guest_id, r.course_id, r.dish_id, null, p_reason, auth.uid()
    from removed r
    join public.guests g on g.id = r.guest_id
    join public.courses c on c.id = r.course_id
    join public.dishes d on d.id = r.dish_id;
$$;

-- When an answer leaves "attending", that guest's choices for the event go.
create function public.invitations_clear_meals_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.remove_meal_selections(
    new.guest_id, new.event_id,
    case when new.status = 'declined' then 'declined' else 'changed' end
  );
  return null;
end;
$$;

create trigger invitations_clear_meals_on_change
  after update of status on public.invitations
  for each row
  when (old.status = 'attending' and new.status <> 'attending')
  execute function public.invitations_clear_meals_on_change();

-- Removing an invitation removes the choices for that event.
create function public.invitations_clear_meals_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.remove_meal_selections(old.guest_id, old.event_id, 'changed');
  return null;
end;
$$;

create trigger invitations_clear_meals_on_delete
  after delete on public.invitations
  for each row execute function public.invitations_clear_meals_on_delete();

revoke execute on function
  public.meal_selections_enforce_rules(), public.meal_selections_record_history(),
  public.invitations_clear_meals_on_change(), public.invitations_clear_meals_on_delete()
from public, anon, authenticated;

-- Audit trail (column names only).
create trigger menus_audit
  after insert or update or delete on public.menus
  for each row execute function public.audit_row_change();
create trigger guest_dietary_audit
  after insert or update or delete on public.guest_dietary
  for each row execute function public.audit_row_change('guest_id');
create trigger meal_selections_audit
  after insert or update or delete on public.meal_selections
  for each row execute function public.audit_row_change('guest_id');

-- Row-level security.
alter table public.menus enable row level security;
alter table public.courses enable row level security;
alter table public.dishes enable row level security;
alter table public.dietary_categories enable row level security;
alter table public.dish_tags enable row level security;
alter table public.guest_dietary enable row level security;
alter table public.meal_selections enable row level security;
alter table public.meal_selection_history enable row level security;

revoke all on
  public.menus, public.courses, public.dishes, public.dietary_categories, public.dish_tags,
  public.guest_dietary, public.meal_selections, public.meal_selection_history
from anon;

-- Written only by the database itself; staff may read.
revoke all on public.meal_selection_history from authenticated;
grant select on public.meal_selection_history to authenticated;

-- Menus: staff everything. A guest reads published and closed menus for events
-- they are invited to (the invitations policy limits that to their household),
-- then the courses, non-archived dishes, and tags that follow from those.
create policy menus_staff_all on public.menus
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy menus_guest_select on public.menus
  for select to authenticated
  using (
    status in ('published', 'closed')
    and exists (select 1 from public.invitations i where i.event_id = menus.event_id)
  );

create policy courses_staff_all on public.courses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy courses_guest_select on public.courses
  for select to authenticated
  using (exists (select 1 from public.menus m where m.id = courses.menu_id));

create policy dishes_staff_all on public.dishes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy dishes_guest_select on public.dishes
  for select to authenticated
  using (archived_at is null and exists (select 1 from public.courses c where c.id = dishes.course_id));

create policy dish_tags_staff_all on public.dish_tags
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy dish_tags_guest_select on public.dish_tags
  for select to authenticated
  using (exists (select 1 from public.dishes d where d.id = dish_tags.dish_id));

-- The category list is a shared lookup, not personal data.
create policy dietary_categories_staff_all on public.dietary_categories
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy dietary_categories_signed_in_select on public.dietary_categories
  for select to authenticated using (true);

-- A guest reads rows for guests in their own household; writes go through the
-- RPCs.
create policy guest_dietary_staff_all on public.guest_dietary
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy guest_dietary_guest_select on public.guest_dietary
  for select to authenticated
  using (exists (
    select 1 from public.guests g
     where g.id = guest_dietary.guest_id and g.household_id = public.current_household_id()
  ));

create policy meal_selections_staff_all on public.meal_selections
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy meal_selections_guest_select on public.meal_selections
  for select to authenticated
  using (exists (
    select 1 from public.guests g
     where g.id = meal_selections.guest_id and g.household_id = public.current_household_id()
  ));

create policy meal_selection_history_staff_select on public.meal_selection_history
  for select to authenticated using (public.is_staff());
