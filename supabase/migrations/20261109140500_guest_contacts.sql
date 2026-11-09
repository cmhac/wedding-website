-- The addresses of the caller's own household, for the guest API (which masks
-- them before they reach the guest). A function rather than a direct table
-- read, like the other guest endpoints. Raises not_a_guest for anon and for
-- signed-in users with no household.
create function public.get_my_contacts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hid uuid := private.my_household_id();
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object('kind', c.kind, 'value', c.value::text)
      order by c.created_at, c.id
    )
    from public.household_contacts c
    where c.household_id = v_hid
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_my_contacts() from public, anon;
grant execute on function public.get_my_contacts() to anon, authenticated;
