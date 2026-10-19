-- Meal and dietary reporting views, the staff meal functions, and the guest
-- functions extended with meals and structured dietary data.
--
-- Extra error code used here: invalid_meal (a meal choice the rules refuse).

-- ---------------------------------------------------------------------------
-- Views. All run with the caller's rights and return rows only to staff.
-- ---------------------------------------------------------------------------

-- Chosen dishes that conflict with a restriction. A `diet` restriction (for
-- example vegetarian) conflicts when the dish is not tagged as suitable; an
-- `allergen` restriction (for example nuts) conflicts when the dish is tagged
-- as containing it. Only as accurate as the tags the couple entered.
create view public.meal_conflicts
with (security_invoker = true) as
select
  m.event_id,
  e.slug as event_slug,
  c.id as course_id,
  c.name as course_name,
  g.id as guest_id,
  g.household_id,
  g.first_name,
  g.last_name,
  d.id as dish_id,
  d.name as dish_name,
  dc.key as category_key,
  dc.kind,
  gd.severity
from public.meal_selections ms
join public.courses c on c.id = ms.course_id
join public.menus m on m.id = c.menu_id
join public.events e on e.id = m.event_id
join public.dishes d on d.id = ms.dish_id
join public.guests g on g.id = ms.guest_id
join public.invitations i on i.guest_id = g.id and i.event_id = m.event_id and i.status = 'attending'
join public.guest_dietary gd on gd.guest_id = g.id
join public.dietary_categories dc on dc.key = gd.category_key
left join public.dish_tags dt on dt.dish_id = d.id and dt.category_key = dc.key
where public.is_staff()
  and ((dc.kind = 'diet' and dt.dish_id is null)
    or (dc.kind = 'allergen' and dt.dish_id is not null));

-- Per event and course: how many attending guests chose each non-archived
-- dish, plus one "not yet chosen" row (no dish) for each course that requires
-- a choice.
create view public.dish_totals
with (security_invoker = true) as
select
  m.event_id,
  e.slug as event_slug,
  c.id as course_id,
  c.name as course_name,
  c.display_order as course_display_order,
  d.id as dish_id,
  d.name as dish_name,
  count(att.guest_id) as chosen_count,
  false as not_yet_chosen
from public.courses c
join public.menus m on m.id = c.menu_id
join public.events e on e.id = m.event_id
join public.dishes d on d.course_id = c.id and d.archived_at is null
left join (
  select ms.dish_id, ms.guest_id
  from public.meal_selections ms
  join public.courses cc on cc.id = ms.course_id
  join public.menus mm on mm.id = cc.menu_id
  join public.invitations i on i.guest_id = ms.guest_id and i.event_id = mm.event_id and i.status = 'attending'
) att on att.dish_id = d.id
where public.is_staff()
group by m.event_id, e.slug, c.id, c.name, c.display_order, d.id, d.name
union all
select
  m.event_id,
  e.slug,
  c.id,
  c.name,
  c.display_order,
  null::uuid,
  null::text,
  count(i.guest_id),
  true
from public.courses c
join public.menus m on m.id = c.menu_id
join public.events e on e.id = m.event_id
left join public.invitations i
  on i.event_id = m.event_id
 and i.status = 'attending'
 and not exists (
   select 1 from public.meal_selections ms where ms.guest_id = i.guest_id and ms.course_id = c.id
 )
where c.requires_choice and public.is_staff()
group by m.event_id, e.slug, c.id, c.name, c.display_order;

-- Attending guests with a structured restriction or a free-text dietary note,
-- per event. A guest with several restrictions has one row for each; a guest
-- with only a note has one row with no category.
create view public.dietary_list
with (security_invoker = true) as
select
  i.event_id,
  e.slug as event_slug,
  g.household_id,
  h.display_name as household_name,
  g.id as guest_id,
  g.first_name,
  g.last_name,
  gd.category_key,
  dc.label as category_label,
  gd.severity,
  gd.details,
  g.dietary_notes
from public.invitations i
join public.events e on e.id = i.event_id
join public.guests g on g.id = i.guest_id
join public.households h on h.id = g.household_id
left join public.guest_dietary gd on gd.guest_id = g.id
left join public.dietary_categories dc on dc.key = gd.category_key
where i.status = 'attending'
  and public.is_staff()
  and (gd.guest_id is not null or nullif(btrim(g.dietary_notes), '') is not null);

revoke all on public.meal_conflicts, public.dish_totals, public.dietary_list from public, anon;
grant select on public.meal_conflicts, public.dish_totals, public.dietary_list to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------

-- Staff choose a dish for a guest (any menu status), or clear the choice with a
-- null dish. The staff member is recorded as the chooser.
create function public.staff_set_meal(guest_id uuid, course_id uuid, dish_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();

  if not exists (select 1 from public.guests g where g.id = staff_set_meal.guest_id)
     or not exists (select 1 from public.courses c where c.id = staff_set_meal.course_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if staff_set_meal.dish_id is null then
    with removed as (
      delete from public.meal_selections ms
       where ms.guest_id = staff_set_meal.guest_id and ms.course_id = staff_set_meal.course_id
      returning ms.guest_id, ms.course_id, ms.dish_id
    )
    insert into public.meal_selection_history (guest_id, course_id, old_dish_id, new_dish_id, reason, changed_by)
    select r.guest_id, r.course_id, r.dish_id, null, 'changed', auth.uid() from removed r;
  else
    begin
      insert into public.meal_selections (guest_id, course_id, dish_id, chosen_by)
      values (staff_set_meal.guest_id, staff_set_meal.course_id, staff_set_meal.dish_id, auth.uid())
      on conflict on constraint meal_selections_pkey
        do update set dish_id = excluded.dish_id, chosen_by = excluded.chosen_by;
    exception when foreign_key_violation then
      raise exception 'invalid_meal' using errcode = 'P0001';
    end;
  end if;

  return jsonb_build_object(
    'guest_id', staff_set_meal.guest_id,
    'course_id', staff_set_meal.course_id,
    'dish_id', staff_set_meal.dish_id
  );
end;
$$;

-- Retire a dish: its selections move to the history (reason dish_archived) and
-- are removed, and the guests and households who must choose again are
-- returned. Archiving twice affects nobody the second time.
create function public.archive_dish(dish_id uuid)
returns table (guest_id uuid, household_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived timestamptz;
  v_found boolean;
begin
  perform private.require_staff();

  select d.archived_at, true into v_archived, v_found
    from public.dishes d where d.id = archive_dish.dish_id for update;
  if v_found is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_archived is not null then
    return;
  end if;

  update public.dishes d set archived_at = now() where d.id = archive_dish.dish_id;

  return query
  with removed as (
    delete from public.meal_selections ms
     where ms.dish_id = archive_dish.dish_id
    returning ms.guest_id, ms.course_id
  ),
  logged as (
    insert into public.meal_selection_history (guest_id, course_id, old_dish_id, new_dish_id, reason, changed_by)
    select r.guest_id, r.course_id, archive_dish.dish_id, null, 'dish_archived', auth.uid()
      from removed r
    returning meal_selection_history.guest_id
  )
  select g.id, g.household_id
    from removed r join public.guests g on g.id = r.guest_id
   order by g.household_id, g.id;
end;
$$;

revoke execute on function public.staff_set_meal(uuid, uuid, uuid), public.archive_dish(uuid) from public, anon;
grant execute on function public.staff_set_meal(uuid, uuid, uuid), public.archive_dish(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guest functions, extended
-- ---------------------------------------------------------------------------

-- The caller's household, guests (with structured dietary needs), invitations
-- with the event fields and the effective deadline, and for events the guest
-- attends with a published or closed menu: its courses, non-archived dishes with
-- tags, and the guest's selections. Also the dietary categories. Only the
-- caller's household; never a draft menu or an archived dish.
create or replace function public.get_my_rsvp()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hid uuid := private.my_household_id();
begin
  return jsonb_build_object(
    'household', (
      select jsonb_build_object(
        'display_name', h.display_name,
        'plus_one_allowance', h.plus_one_allowance,
        'message_to_couple', h.message_to_couple,
        'reminders_opt_out', h.reminders_opt_out
      ) from public.households h where h.id = v_hid
    ),
    'guests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'first_name', g.first_name,
          'last_name', g.last_name,
          'is_placeholder', g.is_placeholder,
          'dietary_notes', g.dietary_notes,
          'dietary', coalesce((
            select jsonb_agg(
              jsonb_build_object('category_key', gd.category_key, 'severity', gd.severity, 'details', gd.details)
              order by dc.display_order nulls last, gd.category_key)
            from public.guest_dietary gd
            join public.dietary_categories dc on dc.key = gd.category_key
            where gd.guest_id = g.id
          ), '[]'::jsonb),
          'invitations', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'status', i.status,
                'event', jsonb_build_object(
                  'id', e.id,
                  'slug', e.slug,
                  'name', e.name,
                  'starts_at', e.starts_at,
                  'venue_name', e.venue_name,
                  'is_required', e.is_required,
                  'group_key', e.group_key,
                  'display_order', e.display_order,
                  'deadline', public.effective_rsvp_deadline(v_hid, e.id),
                  'closed', private.rsvp_closed_for(v_hid, e.id)
                )
              ) || coalesce((
                select jsonb_build_object('menu', jsonb_build_object(
                  'status', mn.status,
                  'courses', coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', c.id,
                        'name', c.name,
                        'display_order', c.display_order,
                        'requires_choice', c.requires_choice,
                        'dishes', coalesce((
                          select jsonb_agg(
                            jsonb_build_object(
                              'id', d.id,
                              'name', d.name,
                              'description', d.description,
                              'tags', coalesce((
                                select jsonb_agg(dt.category_key order by dc2.display_order nulls last, dt.category_key)
                                from public.dish_tags dt
                                join public.dietary_categories dc2 on dc2.key = dt.category_key
                                where dt.dish_id = d.id
                              ), '[]'::jsonb)
                            ) order by d.name, d.id)
                          from public.dishes d
                          where d.course_id = c.id and d.archived_at is null
                        ), '[]'::jsonb)
                      ) order by c.display_order nulls last, c.id)
                    from public.courses c where c.menu_id = mn.id
                  ), '[]'::jsonb),
                  'selection', coalesce((
                    select jsonb_agg(
                      jsonb_build_object('course_id', ms.course_id, 'dish_id', ms.dish_id)
                      order by ms.course_id)
                    from public.meal_selections ms
                    join public.courses c3 on c3.id = ms.course_id
                    where ms.guest_id = g.id and c3.menu_id = mn.id
                  ), '[]'::jsonb)
                ))
                from public.menus mn
                where mn.event_id = e.id
                  and mn.status in ('published', 'closed')
                  and i.status = 'attending'
              ), '{}'::jsonb)
              order by e.display_order nulls last, e.id
            )
            from public.invitations i
            join public.events e on e.id = i.event_id
            where i.guest_id = g.id
          ), '[]'::jsonb)
        ) order by g.created_at, g.id
      ) from public.guests g where g.household_id = v_hid
    ), '[]'::jsonb),
    'dietary_categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('key', dc.key, 'label', dc.label, 'kind', dc.kind)
        order by dc.display_order nulls last, dc.key)
      from public.dietary_categories dc
    ), '[]'::jsonb)
  );
end;
$$;

-- Saves a household's answers, structured dietary needs and meal choices. See
-- contracts/database-rpc.md for the payload and rules.
create or replace function public.submit_household_rsvp(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hid uuid := private.my_household_id();
  v_staff boolean := public.is_staff();
  gp jsonb;
  r jsonb;
  d jsonb;
  m jsonb;
  v_gid uuid;
  v_eid uuid;
  v_cid uuid;
  v_did uuid;
  v_status public.rsvp_status;
  v_old public.rsvp_status;
  v_keys text[];
  v_menu_status public.menu_status;
  v_existing uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object'
     or (payload ? 'guests' and jsonb_typeof(payload -> 'guests') is distinct from 'array') then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  if not v_staff and not (select rsvp_open from public.settings) then
    raise exception 'rsvp_closed' using errcode = 'P0001';
  end if;

  if payload ? 'message_to_couple' then
    update public.households h
       set message_to_couple = nullif(btrim(payload ->> 'message_to_couple'), '')
     where h.id = v_hid
       and h.message_to_couple is distinct from nullif(btrim(payload ->> 'message_to_couple'), '');
  end if;

  for gp in select * from jsonb_array_elements(coalesce(payload -> 'guests', '[]'::jsonb)) loop
    if not coalesce(pg_input_is_valid(gp ->> 'guest_id', 'uuid'), false) then
      raise exception 'invalid_payload' using errcode = 'P0001';
    end if;
    v_gid := (gp ->> 'guest_id')::uuid;
    if not exists (select 1 from public.guests g where g.id = v_gid and g.household_id = v_hid) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;

    if gp ? 'dietary_notes' then
      update public.guests g
         set dietary_notes = nullif(btrim(gp ->> 'dietary_notes'), '')
       where g.id = v_gid
         and g.dietary_notes is distinct from nullif(btrim(gp ->> 'dietary_notes'), '');
    end if;

    -- Attendance first, so that choices below see the new answers.
    for r in select * from jsonb_array_elements(coalesce(gp -> 'responses', '[]'::jsonb)) loop
      if not coalesce(pg_input_is_valid(r ->> 'event_id', 'uuid'), false)
         or coalesce(r ->> 'status', '') not in ('attending', 'declined') then
        raise exception 'invalid_payload' using errcode = 'P0001';
      end if;
      v_eid := (r ->> 'event_id')::uuid;
      v_status := (r ->> 'status')::public.rsvp_status;

      select i.status into v_old
        from public.invitations i where i.guest_id = v_gid and i.event_id = v_eid;
      if not found then
        raise exception 'forbidden' using errcode = 'P0001';
      end if;

      if v_old is distinct from v_status then
        if not v_staff and private.rsvp_closed_for(v_hid, v_eid) then
          raise exception 'rsvp_closed' using errcode = 'P0001';
        end if;
        update public.invitations i
           set status = v_status, responded_at = now(), responded_by = auth.uid()
         where i.guest_id = v_gid and i.event_id = v_eid;
      end if;
    end loop;

    -- Structured dietary needs: the submitted list replaces the stored one.
    if gp ? 'dietary' then
      if jsonb_typeof(gp -> 'dietary') is distinct from 'array' then
        raise exception 'invalid_payload' using errcode = 'P0001';
      end if;
      v_keys := '{}';
      for d in select * from jsonb_array_elements(gp -> 'dietary') loop
        if jsonb_typeof(d) is distinct from 'object'
           or coalesce(d ->> 'severity', '') not in ('allergy', 'preference')
           or not exists (select 1 from public.dietary_categories dc where dc.key = d ->> 'category_key') then
          raise exception 'invalid_payload' using errcode = 'P0001';
        end if;
        v_keys := v_keys || (d ->> 'category_key');
        insert into public.guest_dietary (guest_id, category_key, severity, details)
        values (v_gid, d ->> 'category_key', d ->> 'severity', nullif(btrim(d ->> 'details'), ''))
        on conflict (guest_id, category_key) do update
          set severity = excluded.severity, details = excluded.details
          where (guest_dietary.severity, guest_dietary.details)
                is distinct from (excluded.severity, excluded.details);
      end loop;
      delete from public.guest_dietary gd
       where gd.guest_id = v_gid and gd.category_key <> all (v_keys);
    end if;

    -- Meal choices.
    if gp ? 'meals' then
      if jsonb_typeof(gp -> 'meals') is distinct from 'array' then
        raise exception 'invalid_payload' using errcode = 'P0001';
      end if;
      for m in select * from jsonb_array_elements(gp -> 'meals') loop
        if jsonb_typeof(m) is distinct from 'object'
           or not coalesce(pg_input_is_valid(m ->> 'course_id', 'uuid'), false)
           or not coalesce(pg_input_is_valid(m ->> 'dish_id', 'uuid'), false) then
          raise exception 'invalid_payload' using errcode = 'P0001';
        end if;
        v_cid := (m ->> 'course_id')::uuid;
        v_did := (m ->> 'dish_id')::uuid;

        select mn.event_id, mn.status into v_eid, v_menu_status
          from public.courses c join public.menus mn on mn.id = c.menu_id
         where c.id = v_cid;
        if not found then
          raise exception 'invalid_meal' using errcode = 'P0001';
        end if;

        -- Sending back the choice already stored is never an error.
        select ms.dish_id into v_existing
          from public.meal_selections ms where ms.guest_id = v_gid and ms.course_id = v_cid;
        if v_existing is not distinct from v_did then
          continue;
        end if;

        if not exists (
          select 1 from public.invitations i
           where i.guest_id = v_gid and i.event_id = v_eid and i.status = 'attending'
        ) or (not v_staff and v_menu_status <> 'published') then
          raise exception 'invalid_meal' using errcode = 'P0001';
        end if;
        if not v_staff and private.rsvp_closed_for(v_hid, v_eid) then
          raise exception 'rsvp_closed' using errcode = 'P0001';
        end if;

        begin
          insert into public.meal_selections (guest_id, course_id, dish_id, chosen_by)
          values (v_gid, v_cid, v_did, auth.uid())
          on conflict (guest_id, course_id)
            do update set dish_id = excluded.dish_id, chosen_by = excluded.chosen_by;
        exception when foreign_key_violation then
          raise exception 'invalid_meal' using errcode = 'P0001';
        end;
      end loop;
    end if;
  end loop;

  return public.get_my_rsvp();
end;
$$;
