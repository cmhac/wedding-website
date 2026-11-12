-- The "has not opened the site" audience filter, and test campaigns that do not
-- count as the real send (specs/006-save-the-date-outreach/data-model.md).

create or replace function public.is_valid_audience(audience jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_scope text;
  v_filters jsonb;
  v_key text;
  v_value jsonb;
  v_keys text[];
begin
  if audience is null or jsonb_typeof(audience) <> 'object' then
    return false;
  end if;
  if jsonb_typeof(audience -> 'scope') is distinct from 'string' then
    return false;
  end if;
  v_scope := audience ->> 'scope';
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(audience) as k;

  if v_scope = 'all' then
    return v_keys = array['scope'];
  elsif v_scope = 'household' then
    return v_keys = array['household_id', 'scope']
      and jsonb_typeof(audience -> 'household_id') = 'string'
      and (audience ->> 'household_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  elsif v_scope = 'filter' then
    if v_keys <> array['filters', 'scope'] or jsonb_typeof(audience -> 'filters') is distinct from 'object' then
      return false;
    end if;
    v_filters := audience -> 'filters';
    if not exists (select 1 from jsonb_object_keys(v_filters)) then
      return false;
    end if;
    for v_key, v_value in select * from jsonb_each(v_filters) loop
      if v_key in ('invited_to_event', 'optional_event_unanswered') then
        if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
          return false;
        end if;
      elsif v_key = 'not_yet_sent_message_type' then
        if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ '^[a-z][a-z0-9_]*$' then
          return false;
        end if;
      elsif v_key in ('required_events_unanswered', 'meals_not_chosen', 'delivery_problem', 'not_opened') then
        if v_value <> 'true'::jsonb then
          return false;
        end if;
      else
        return false;
      end if;
    end loop;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.resolve_audience(filter jsonb, message_type_key text default null)
returns table (household_id uuid, display_name text, deliverable boolean, skip_reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_audience jsonb := resolve_audience.filter;
  v_type text := resolve_audience.message_type_key;
  v_scope text;
  v_filters jsonb;
  v_apply_opt_out boolean := false;
  v_essential boolean;
begin
  perform private.require_staff_or_service();

  if not public.is_valid_audience(v_audience) then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  if v_type is not null then
    select t.is_essential into v_essential from public.message_types t where t.key = v_type;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    v_apply_opt_out := not v_essential;
  end if;

  v_scope := v_audience ->> 'scope';
  v_filters := coalesce(v_audience -> 'filters', '{}'::jsonb);

  return query
  select
    h.id,
    h.display_name,
    exists (select 1 from public.household_contacts c where c.household_id = h.id and c.kind = 'email') and not (v_apply_opt_out and h.reminders_opt_out),
    case
      when not exists (select 1 from public.household_contacts c where c.household_id = h.id and c.kind = 'email') then 'no_email'
      when v_apply_opt_out and h.reminders_opt_out then 'opted_out'
    end
  from public.households h
  where (
    v_scope = 'all'
    or (v_scope = 'household' and h.id = (v_audience ->> 'household_id')::uuid)
    or (
      v_scope = 'filter'
      and (not (v_filters ? 'invited_to_event') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id
        join public.events e on e.id = i.event_id
        where g.household_id = h.id and e.slug = v_filters ->> 'invited_to_event'
      ))
      -- Optional events never count as "has not responded".
      and (not (v_filters ? 'required_events_unanswered') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id and i.status = 'pending'
        join public.events e on e.id = i.event_id and e.is_required
        where g.household_id = h.id
      ))
      and (not (v_filters ? 'optional_event_unanswered') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id and i.status = 'pending'
        join public.events e on e.id = i.event_id and not e.is_required
        where g.household_id = h.id and e.slug = v_filters ->> 'optional_event_unanswered'
      ))
      -- Same rule as household_rsvp_progress.pending_meals: an attending guest
      -- with no choice for a course that needs one, on a published menu, where
      -- the course has a dish that can be chosen.
      and (not (v_filters ? 'meals_not_chosen') or exists (
        select 1 from public.guests g
        join public.invitations i on i.guest_id = g.id and i.status = 'attending'
        join public.menus mn on mn.event_id = i.event_id and mn.status = 'published'
        join public.courses c on c.menu_id = mn.id and c.requires_choice
        where g.household_id = h.id
          and exists (select 1 from public.dishes d where d.course_id = c.id and d.archived_at is null)
          and not exists (
            select 1 from public.meal_selections ms where ms.guest_id = g.id and ms.course_id = c.id
          )
      ))
      -- Received means sent or delivered, in any campaign of that type.
      and (not (v_filters ? 'not_yet_sent_message_type') or not exists (
        select 1 from public.messages m
        join public.campaigns c on c.id = m.campaign_id
        where m.household_id = h.id
          and c.message_type_key = v_filters ->> 'not_yet_sent_message_type'
          and m.status in ('sent', 'delivered')
          and not c.is_test
      ))
      and (not (v_filters ? 'delivery_problem') or h.delivery_problem)
      and (not (v_filters ? 'not_opened') or h.first_opened_at is null)
    )
  )
  order by h.display_name, h.id;
end;
$$;
