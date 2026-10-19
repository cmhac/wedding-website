-- The guest RSVP functions and the staff answer-on-behalf function.
--
-- Guests have no direct write access to any table; these functions are their
-- only write path. Each starts by identifying the caller from auth.uid().
-- Errors are raised as the whole message (SQLSTATE P0001): not_a_guest,
-- forbidden, rsvp_closed, not_a_placeholder, invalid_payload, duplicate_name,
-- not_found.
--
-- Closing rules: a non-staff caller is refused (`rsvp_closed`) when
-- settings.rsvp_open is false, or when an answer would change for an event
-- whose effective deadline has passed. Sending back an unchanged answer is
-- never an error, so a form that resubmits everything still works. Staff are
-- not bound by either rule.

-- The household the caller answers for. Raises not_a_guest for anon and for
-- signed-in users with no household.
create function private.my_household_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select h.id into v_id from public.households h where h.auth_user_id = auth.uid();
  if v_id is null then
    raise exception 'not_a_guest' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- True when RSVPs are switched off, or the effective deadline for this
-- household and event has passed.
create function private.rsvp_closed_for(p_household_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (select rsvp_open from public.settings)
      or coalesce(public.effective_rsvp_deadline(p_household_id, p_event_id) < now(), false);
$$;

-- The caller's household, its guests, and for each guest the invitations with
-- the event fields and the effective deadline. Only the caller's household.
create function public.get_my_rsvp()
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
          'dietary', '[]'::jsonb,
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
              ) order by e.display_order nulls last, e.id
            )
            from public.invitations i
            join public.events e on e.id = i.event_id
            where i.guest_id = g.id
          ), '[]'::jsonb)
        ) order by g.created_at, g.id
      ) from public.guests g where g.household_id = v_hid
    ), '[]'::jsonb)
  );
end;
$$;

-- Saves a household's answers. See contracts/database-rpc.md for the payload.
-- Meals and structured dietary data are added by a later migration.
create function public.submit_household_rsvp(payload jsonb)
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
  v_gid uuid;
  v_eid uuid;
  v_status public.rsvp_status;
  v_old public.rsvp_status;
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
    if not pg_input_is_valid(gp ->> 'guest_id', 'uuid') then
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

    for r in select * from jsonb_array_elements(coalesce(gp -> 'responses', '[]'::jsonb)) loop
      if not pg_input_is_valid(r ->> 'event_id', 'uuid')
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
  end loop;

  return public.get_my_rsvp();
end;
$$;

-- Fills an unnamed plus-one seat in the caller's household.
create function public.name_plus_one(guest_id uuid, first_name text, last_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hid uuid := private.my_household_id();
  v_first text := nullif(btrim(first_name), '');
  v_last text := nullif(btrim(last_name), '');
  v_placeholder boolean;
  v_result jsonb;
begin
  select g.is_placeholder into v_placeholder
    from public.guests g
   where g.id = name_plus_one.guest_id and g.household_id = v_hid;
  if not found then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not v_placeholder then
    raise exception 'not_a_placeholder' using errcode = 'P0001';
  end if;

  if v_first is null or v_last is null then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  if not public.is_staff() then
    -- Closed when RSVPs are off, or when every event the seat is invited to has
    -- passed its deadline.
    if not (select rsvp_open from public.settings)
       or (exists (select 1 from public.invitations i where i.guest_id = name_plus_one.guest_id)
           and not exists (
             select 1 from public.invitations i
              where i.guest_id = name_plus_one.guest_id
                and not private.rsvp_closed_for(v_hid, i.event_id))) then
      raise exception 'rsvp_closed' using errcode = 'P0001';
    end if;
  end if;

  begin
    update public.guests g
       set first_name = v_first, last_name = v_last, is_placeholder = false
     where g.id = name_plus_one.guest_id;
  exception when unique_violation then
    raise exception 'duplicate_name' using errcode = 'P0001';
  end;

  select jsonb_build_object(
    'id', g.id, 'first_name', g.first_name, 'last_name', g.last_name,
    'is_placeholder', g.is_placeholder, 'dietary_notes', g.dietary_notes
  ) into v_result from public.guests g where g.id = name_plus_one.guest_id;
  return v_result;
end;
$$;

-- Staff answer on a household's behalf. Ignores deadlines; the staff member is
-- recorded as the responder.
create function public.staff_set_rsvp(guest_id uuid, event_id uuid, status public.rsvp_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.invitations;
begin
  perform private.require_staff();

  update public.invitations i
     set status = staff_set_rsvp.status,
         responded_at = case when staff_set_rsvp.status = 'pending' then null else now() end,
         responded_by = case when staff_set_rsvp.status = 'pending' then null else auth.uid() end
   where i.guest_id = staff_set_rsvp.guest_id and i.event_id = staff_set_rsvp.event_id
  returning * into v_row;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'guest_id', v_row.guest_id, 'event_id', v_row.event_id,
    'status', v_row.status, 'responded_at', v_row.responded_at
  );
end;
$$;

-- Guest-facing functions refuse anon themselves (not_a_guest); staff functions
-- are not executable by anon at all.
revoke execute on function
  public.get_my_rsvp(), public.submit_household_rsvp(jsonb), public.name_plus_one(uuid, text, text),
  public.staff_set_rsvp(uuid, uuid, public.rsvp_status)
from public, anon;
grant execute on function
  public.get_my_rsvp(), public.submit_household_rsvp(jsonb), public.name_plus_one(uuid, text, text)
to anon, authenticated;
grant execute on function public.staff_set_rsvp(uuid, uuid, public.rsvp_status) to authenticated, service_role;
