-- Staff-only household tooling: bulk import, inviting guests to an event,
-- possible-duplicate detection, and the household create, delete, and contact
-- change records that the admin route handlers call so that changes are
-- attributed to the signed-in staff member.
--
-- Error codes are raised as the whole exception message (for example
-- `forbidden`), with SQLSTATE P0001, so callers can match on the code word.

-- Internal helpers live in a schema that the API does not expose.
create schema if not exists private;
revoke all on schema private from public;

-- The caller must be a staff member.
create function private.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
end;
$$;

-- True when the request carries the service-role JWT (route handlers using the
-- service-role key). Like auth.uid(), this reads the verified JWT claims.
create function private.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

-- The caller must be a staff member or the service role.
create function private.require_staff_or_service()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_staff() or private.is_service_role()) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on all functions in schema private from public;

-- One validation error for the import result.
create function private.import_error(p_row integer, p_field text, p_message text, p_code text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'row', p_row, 'field', p_field, 'message', p_message, 'code', p_code
  ));
$$;

create function private.json_row_number(p jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p -> 'row') = 'number' and (p ->> 'row') ~ '^[0-9]{1,9}$'
              then (p ->> 'row')::integer end;
$$;

-- Lower-cased text with everything but letters and digits removed, so that
-- "The  Smiths." and "the smiths" compare equal.
create function private.normalize_text(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(coalesce(t, ''), '[^[:alnum:]]+', '', 'g')), '');
$$;

create function private.normalize_address(a jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(a) = 'object' then (
    select nullif(string_agg(private.normalize_text(e.value), '|' order by e.key), '')
    from jsonb_each_text(a) e
    where private.normalize_text(e.value) is not null
  ) end;
$$;

-- Validates one household (in the import row shape) and, when it is valid,
-- creates it with its guests and their invitations. Nothing is created when
-- anything is wrong. Returns
--   {household_id, guest_ids, invitations, errors: [{row, field, message, code?}]}.
-- Messages never name another household's data.
create function private.import_one_household(h jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  errors jsonb := '[]'::jsonb;
  guests_in jsonb;
  g jsonb;
  v_slug jsonb;
  hrow integer;
  grow integer;
  v_name text;
  v_email text;
  v_paper boolean;
  v_allowance integer := 0;
  v_deadline timestamptz;
  v_address jsonb;
  v_first text;
  v_last text;
  v_gemail text;
  v_placeholder boolean;
  v_plus_one boolean;
  v_seats integer := 0;
  seen_names text[] := '{}';
  name_key text;
  v_hid uuid;
  v_gid uuid;
  v_guest_ids uuid[] := '{}';
  v_invites integer := 0;
  v_added integer;
  email_pattern constant text := '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
begin
  if jsonb_typeof(h) is distinct from 'object' then
    return jsonb_build_object('errors', jsonb_build_array(
      private.import_error(null, 'household', 'each household must be an object', 'invalid_payload')));
  end if;

  guests_in := case when jsonb_typeof(h -> 'guests') = 'array' then h -> 'guests' else '[]'::jsonb end;
  hrow := coalesce(private.json_row_number(h), private.json_row_number(guests_in -> 0));

  v_name := nullif(btrim(h ->> 'display_name'), '');
  if v_name is null then
    errors := errors || private.import_error(hrow, 'display_name', 'is required');
  end if;

  v_email := nullif(btrim(h ->> 'contact_email'), '');
  v_paper := coalesce((h ->> 'paper_only')::boolean, false);
  if v_email is not null and v_paper then
    errors := errors || private.import_error(hrow, 'contact_email', 'a paper-only household has no contact email');
  elsif v_email is not null and v_email !~ email_pattern then
    errors := errors || private.import_error(hrow, 'contact_email', 'is not a valid email address');
  elsif v_email is not null and exists (
    select 1 from public.households where contact_email = v_email::extensions.citext
  ) then
    errors := errors || private.import_error(hrow, 'contact_email', 'is already used by another household', 'email_in_use');
  end if;

  if h ? 'plus_one_allowance' and jsonb_typeof(h -> 'plus_one_allowance') <> 'null' then
    if jsonb_typeof(h -> 'plus_one_allowance') = 'number'
       and (h ->> 'plus_one_allowance') ~ '^[0-9]{1,4}$' then
      v_allowance := (h ->> 'plus_one_allowance')::integer;
    else
      errors := errors || private.import_error(hrow, 'plus_one_allowance', 'must be a whole number, zero or more');
    end if;
  end if;

  if h ? 'rsvp_deadline_override' and jsonb_typeof(h -> 'rsvp_deadline_override') = 'string' then
    if pg_input_is_valid(h ->> 'rsvp_deadline_override', 'timestamptz') then
      v_deadline := (h ->> 'rsvp_deadline_override')::timestamptz;
    else
      errors := errors || private.import_error(hrow, 'rsvp_deadline_override', 'is not a valid date and time');
    end if;
  end if;

  v_address := case when jsonb_typeof(h -> 'address') = 'object' then h -> 'address' end;

  if jsonb_array_length(guests_in) = 0 then
    errors := errors || private.import_error(hrow, 'guests', 'a household needs at least one guest');
  end if;

  for g in select * from jsonb_array_elements(guests_in) loop
    grow := coalesce(private.json_row_number(g), hrow);
    v_placeholder := coalesce((g ->> 'is_placeholder')::boolean, false);
    v_plus_one := v_placeholder or coalesce((g ->> 'is_plus_one')::boolean, false);
    v_first := nullif(btrim(g ->> 'first_name'), '');
    v_last := nullif(btrim(g ->> 'last_name'), '');
    v_gemail := nullif(btrim(g ->> 'email'), '');

    if v_plus_one then
      v_seats := v_seats + 1;
    end if;

    if not v_placeholder then
      if v_first is null then
        errors := errors || private.import_error(grow, 'first_name', 'is required');
      end if;
      if v_last is null then
        errors := errors || private.import_error(grow, 'last_name', 'is required');
      end if;
      if v_first is not null and v_last is not null then
        name_key := lower(v_first) || '|' || lower(v_last);
        if name_key = any (seen_names) then
          errors := errors || private.import_error(grow, 'first_name', 'duplicates another guest in the same household');
        end if;
        seen_names := seen_names || name_key;
      end if;
    end if;

    if v_gemail is not null and v_gemail !~ email_pattern then
      errors := errors || private.import_error(grow, 'email', 'is not a valid email address');
    end if;

    if g ? 'events' and jsonb_typeof(g -> 'events') <> 'null' then
      if jsonb_typeof(g -> 'events') <> 'array' then
        errors := errors || private.import_error(grow, 'events', 'must be a list of event slugs');
      else
        for v_slug in select * from jsonb_array_elements(g -> 'events') loop
          if jsonb_typeof(v_slug) <> 'string'
             or not exists (select 1 from public.events e where e.slug = v_slug #>> '{}') then
            errors := errors || private.import_error(grow, 'events', 'names an event that does not exist');
          end if;
        end loop;
      end if;
    end if;
  end loop;

  if v_seats > v_allowance then
    errors := errors || private.import_error(hrow, 'plus_one_allowance', 'is lower than the number of plus-one guests');
  end if;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('errors', errors);
  end if;

  -- Everything checked: create the household, its guests and invitations
  -- together. The block is a subtransaction, so a failure leaves nothing behind.
  begin
    insert into public.households (
      display_name, contact_email, auth_user_id, address, plus_one_allowance,
      rsvp_deadline_override, notes
    ) values (
      v_name, v_email::extensions.citext, (h ->> 'auth_user_id')::uuid, v_address, v_allowance,
      v_deadline, nullif(btrim(h ->> 'notes'), '')
    ) returning id into v_hid;

    for g in select * from jsonb_array_elements(guests_in) loop
      v_placeholder := coalesce((g ->> 'is_placeholder')::boolean, false);
      v_plus_one := v_placeholder or coalesce((g ->> 'is_plus_one')::boolean, false);
      insert into public.guests (
        household_id, first_name, last_name, email, is_placeholder, is_plus_one,
        dietary_notes, notes
      ) values (
        v_hid,
        case when v_placeholder then null else nullif(btrim(g ->> 'first_name'), '') end,
        case when v_placeholder then null else nullif(btrim(g ->> 'last_name'), '') end,
        nullif(btrim(g ->> 'email'), '')::extensions.citext,
        v_placeholder, v_plus_one,
        nullif(btrim(g ->> 'dietary_notes'), ''), nullif(btrim(g ->> 'notes'), '')
      ) returning id into v_gid;
      v_guest_ids := v_guest_ids || v_gid;

      if jsonb_typeof(g -> 'events') = 'array' then
        insert into public.invitations (guest_id, event_id, invited_by)
        select v_gid, e.id, auth.uid()
          from public.events e
         where e.slug in (select jsonb_array_elements_text(g -> 'events'))
        on conflict do nothing;
        get diagnostics v_added = row_count;
        v_invites := v_invites + v_added;
      end if;
    end loop;
  exception
    when unique_violation then
      return jsonb_build_object('errors', jsonb_build_array(
        private.import_error(hrow, 'contact_email', 'is already used by another household', 'email_in_use')));
    when invalid_text_representation then
      return jsonb_build_object('errors', jsonb_build_array(
        private.import_error(hrow, 'household', 'contains a value of the wrong type', 'invalid_payload')));
  end;

  return jsonb_build_object(
    'household_id', v_hid,
    'guest_ids', to_jsonb(v_guest_ids),
    'invitations', v_invites,
    'errors', '[]'::jsonb
  );
end;
$$;

-- import_households(rows): every household is created with its guests and
-- invitations, or not at all; valid households in the same call are still
-- created. Staff or the service role only.
create function public.import_households(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h jsonb;
  r jsonb;
  all_errors jsonb := '[]'::jsonb;
  ids jsonb := '[]'::jsonb;
  n_households integer := 0;
  n_guests integer := 0;
  n_invites integer := 0;
begin
  perform private.require_staff_or_service();

  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  for h in select * from jsonb_array_elements(rows) loop
    r := private.import_one_household(h);
    all_errors := all_errors || coalesce(r -> 'errors', '[]'::jsonb);
    if r ? 'household_id' then
      n_households := n_households + 1;
      n_guests := n_guests + jsonb_array_length(r -> 'guest_ids');
      n_invites := n_invites + (r ->> 'invitations')::integer;
      ids := ids || jsonb_build_object('ref', h -> 'ref', 'household_id', r -> 'household_id');
    end if;
  end loop;

  return jsonb_build_object(
    'created', jsonb_build_object(
      'households', n_households, 'guests', n_guests, 'invitations', n_invites),
    'errors', coalesce((
      select jsonb_agg(e - 'code' order by (e ->> 'row')::integer nulls last, e ->> 'field')
      from jsonb_array_elements(all_errors) e
    ), '[]'::jsonb),
    'household_ids', ids
  );
end;
$$;

-- invite(guest_ids, event_id): adds invitations without touching existing ones
-- and without sending anything.
create function public.invite(guest_ids uuid[], event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added integer;
  v_known integer;
  v_unique integer;
begin
  perform private.require_staff();

  if guest_ids is null then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.events e where e.id = invite.event_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select count(*) into v_unique from (select distinct unnest(guest_ids)) u;
  select count(*) into v_known from public.guests where id = any (guest_ids);

  insert into public.invitations (guest_id, event_id, invited_by)
  select g.id, invite.event_id, auth.uid()
    from public.guests g
   where g.id = any (guest_ids)
  on conflict do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object(
    'added', v_added,
    'existing', v_known - v_added,
    'unknown', v_unique - v_known
  );
end;
$$;

-- find_duplicate_households(): pairs that share a normalized display name or a
-- normalized address. Flags only; never merges.
create function public.find_duplicate_households()
returns table (household_a uuid, household_b uuid, reasons text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();

  return query
  with norm as (
    select h.id,
           private.normalize_text(h.display_name) as name_key,
           private.normalize_address(h.address) as address_key
      from public.households h
  )
  select a.id, b.id,
         array_remove(array[
           case when a.name_key = b.name_key then 'display_name' end,
           case when a.address_key = b.address_key then 'address' end
         ], null)
    from norm a
    join norm b on a.id < b.id
   where a.name_key = b.name_key or a.address_key = b.address_key
   order by a.id, b.id;
end;
$$;

-- create_household_record(payload): staff create a household with its guests
-- and invitations in one step, attributed to the acting staff member. The route
-- handler creates the sign-in account first and passes its id as auth_user_id.
-- Payload: {display_name, contact_email, auth_user_id, address, notes,
--   plus_one_allowance, rsvp_deadline_override,
--   guests: [{first_name, last_name, email, dietary_notes, notes,
--             is_placeholder, is_plus_one, events: [slug]}]}
create function public.create_household_record(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform private.require_staff();

  r := private.import_one_household(payload);

  if exists (select 1 from jsonb_array_elements(r -> 'errors') e where e ->> 'code' = 'email_in_use') then
    raise exception 'email_in_use' using errcode = 'P0001';
  end if;
  if jsonb_array_length(r -> 'errors') > 0 then
    raise exception 'invalid_payload' using errcode = 'P0001',
      detail = (select jsonb_agg(e - 'code') from jsonb_array_elements(r -> 'errors') e)::text;
  end if;

  return jsonb_build_object(
    'household_id', r -> 'household_id',
    'guest_ids', r -> 'guest_ids',
    'invitations', r -> 'invitations'
  );
end;
$$;

-- delete_household_record(household_id): staff delete a household (its guests,
-- invitations, and answers go with it). Returns the sign-in account that was
-- linked, so the route handler can remove it, and whether that account belongs
-- to a staff member (in which case it must be kept).
create function public.delete_household_record(household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid;
  v_found boolean;
begin
  perform private.require_staff();

  select h.auth_user_id, true into v_auth, v_found
    from public.households h where h.id = delete_household_record.household_id;
  if v_found is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  delete from public.households h where h.id = delete_household_record.household_id;

  return jsonb_build_object(
    'auth_user_id', v_auth,
    'auth_user_is_staff', v_auth is not null and exists (select 1 from public.staff s where s.user_id = v_auth)
  );
end;
$$;

-- set_household_contact(household_id, contact_email, auth_user_id): staff change
-- the contact email and the linked sign-in account together (the columns cannot
-- be written directly). A new email clears the delivery problem flag. Returns
-- the previously linked account so the route handler can remove it.
create function public.set_household_contact(
  household_id uuid, contact_email text, auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(btrim(contact_email), '');
  v_old_auth uuid;
  v_old_email extensions.citext;
  v_found boolean;
begin
  perform private.require_staff();

  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  select h.auth_user_id, h.contact_email, true into v_old_auth, v_old_email, v_found
    from public.households h where h.id = set_household_contact.household_id for update;
  if v_found is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  begin
    update public.households h
       set contact_email = v_email::extensions.citext,
           auth_user_id = set_household_contact.auth_user_id,
           delivery_problem = case
             when v_email::extensions.citext is distinct from v_old_email then false
             else h.delivery_problem end
     where h.id = set_household_contact.household_id;
  exception when unique_violation then
    raise exception 'email_in_use' using errcode = 'P0001';
  end;

  return jsonb_build_object('previous_auth_user_id', v_old_auth);
end;
$$;

revoke execute on function
  public.import_households(jsonb), public.invite(uuid[], uuid), public.find_duplicate_households(),
  public.create_household_record(jsonb), public.delete_household_record(uuid),
  public.set_household_contact(uuid, text, uuid)
from public, anon;
grant execute on function
  public.import_households(jsonb), public.invite(uuid[], uuid), public.find_duplicate_households(),
  public.create_household_record(jsonb), public.delete_household_record(uuid),
  public.set_household_contact(uuid, text, uuid)
to authenticated, service_role;
