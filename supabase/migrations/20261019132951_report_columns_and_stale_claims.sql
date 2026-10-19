-- Report columns and recovery of stuck sends.
--
-- 1. The caterer reports need display text without extra joins: event_name on
--    dish_totals, dietary_list and meal_conflicts, and guest_name (first and
--    last) and household_name on dietary_list and meal_conflicts. New columns
--    go at the end so existing readers keep working.
-- 2. messages.claimed_at records when a message was claimed for sending, so
--    claim_campaign_messages can claim again a message stuck in `sending` for
--    over 15 minutes (a worker that died). Messages the provider has already
--    accepted (provider_message_id set) are left to the webhook, and the
--    provider's idempotency key (the message id) guards the rest.

create or replace view public.meal_conflicts
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
  gd.severity,
  e.name as event_name,
  btrim(coalesce(g.first_name, '') || ' ' || coalesce(g.last_name, '')) as guest_name,
  h.display_name as household_name
from public.meal_selections ms
join public.courses c on c.id = ms.course_id
join public.menus m on m.id = c.menu_id
join public.events e on e.id = m.event_id
join public.dishes d on d.id = ms.dish_id
join public.guests g on g.id = ms.guest_id
join public.households h on h.id = g.household_id
join public.invitations i on i.guest_id = g.id and i.event_id = m.event_id and i.status = 'attending'
join public.guest_dietary gd on gd.guest_id = g.id
join public.dietary_categories dc on dc.key = gd.category_key
left join public.dish_tags dt on dt.dish_id = d.id and dt.category_key = dc.key
where public.is_staff()
  and ((dc.kind = 'diet' and dt.dish_id is null)
    or (dc.kind = 'allergen' and dt.dish_id is not null));

create or replace view public.dish_totals
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
  false as not_yet_chosen,
  e.name as event_name
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
group by m.event_id, e.slug, e.name, c.id, c.name, c.display_order, d.id, d.name
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
  true,
  e.name
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
group by m.event_id, e.slug, e.name, c.id, c.name, c.display_order;

create or replace view public.dietary_list
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
  g.dietary_notes,
  e.name as event_name,
  btrim(coalesce(g.first_name, '') || ' ' || coalesce(g.last_name, '')) as guest_name
from public.invitations i
join public.events e on e.id = i.event_id
join public.guests g on g.id = i.guest_id
join public.households h on h.id = g.household_id
left join public.guest_dietary gd on gd.guest_id = g.id
left join public.dietary_categories dc on dc.key = gd.category_key
where i.status = 'attending'
  and public.is_staff()
  and (gd.guest_id is not null or nullif(btrim(g.dietary_notes), '') is not null);

alter table public.messages add column claimed_at timestamptz;

create or replace function public.claim_campaign_messages(campaign_id uuid, "limit" integer)
returns table (id uuid, household_id uuid, to_email extensions.citext)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_campaign uuid := claim_campaign_messages.campaign_id;
  v_limit integer := greatest(coalesce(claim_campaign_messages."limit", 0), 0);
  v_essential boolean;
  v_picked integer;
  v_claimed integer;
  r record;
begin
  select t.is_essential into v_essential
    from public.campaigns c
    join public.message_types t on t.key = c.message_type_key
    where c.id = v_campaign and c.status = 'sending';
  if v_essential is null or v_limit = 0 then
    return;
  end if;

  loop
    v_picked := 0;
    v_claimed := 0;
    for r in
      with picked as (
        select m.id, m.household_id
          from public.messages m
          where m.campaign_id = v_campaign
            and (
              m.status = 'queued'
              or (
                m.status = 'sending'
                and m.provider_message_id is null
                and coalesce(m.claimed_at, m.queued_at) < now() - interval '15 minutes'
              )
            )
          order by m.queued_at, m.id
          limit v_limit
          for update skip locked
      ),
      resolved as (
        select p.id,
               h.contact_email,
               case
                 when h.id is null then 'household_missing'
                 when h.contact_email is null then 'no_email'
                 when not v_essential and h.reminders_opt_out then 'opted_out'
               end as skip
          from picked p
          left join public.households h on h.id = p.household_id
      ),
      changed as (
        update public.messages m
           set status = case when rs.skip is null then 'sending' else 'skipped' end::public.message_status,
               skip_reason = rs.skip,
               to_email = case when rs.skip is null then rs.contact_email end,
               claimed_at = case when rs.skip is null then now() end
          from resolved rs
          where m.id = rs.id
          returning m.id, m.household_id, m.to_email, m.status
      )
      select * from changed
    loop
      v_picked := v_picked + 1;
      if r.status = 'sending' then
        v_claimed := v_claimed + 1;
        id := r.id;
        household_id := r.household_id;
        to_email := r.to_email;
        return next;
      end if;
    end loop;
    exit when v_picked = 0 or v_claimed > 0;
  end loop;
end;
$$;
