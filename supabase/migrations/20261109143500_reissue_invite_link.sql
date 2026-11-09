-- reissue_invite_link(household_id): staff issue a household a new personal
-- link. The old link stops working at once (the link is derived from this
-- version) and the new one must be sent again. Returns the new version. The
-- change is audited by the households audit trigger (column names only).
create function public.reissue_invite_link(household_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  perform private.require_staff();

  update public.households h
     set invite_link_version = h.invite_link_version + 1,
         invite_link_issued_at = now()
   where h.id = reissue_invite_link.household_id
   returning h.invite_link_version into v_version;
  if v_version is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return v_version;
end;
$$;

revoke execute on function public.reissue_invite_link(uuid) from public, anon;
grant execute on function public.reissue_invite_link(uuid) to authenticated, service_role;
