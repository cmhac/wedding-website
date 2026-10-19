-- A delivery problem (a bounce or complaint) belongs to an address. Whenever a
-- household's contact email changes, by any path, the problem is cleared. A
-- change of letter case only is not a new address (the column is case-insensitive).
create function public.households_clear_delivery_problem()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.delivery_problem := false;
  return new;
end;
$$;

create trigger households_clear_delivery_problem
  before update of contact_email on public.households
  for each row
  when (new.contact_email is distinct from old.contact_email)
  execute function public.households_clear_delivery_problem();
