-- Campaign messages per address (research R8): a household with several
-- addresses gets one message per address, each sent once even on a retry.
--
-- messages.contact_id names the address a row is for (null on a skipped
-- household row). The uniqueness rule becomes one row per campaign, household
-- and address, with nulls compared as equal so a skipped household still has
-- exactly one row.
--
-- contact_id is deliberately NOT a foreign key. With "on delete set null",
-- removing two addresses of one household after queueing would give two rows
-- the same null address and break the uniqueness rule, so the delete itself
-- would fail. The id is kept instead; claiming looks the address up, and a row
-- whose address no longer exists is skipped with no_email.
--
-- Claiming re-reads the address: the address actually used (to_email) is the
-- contact's current value.

alter table public.messages add column contact_id uuid;

alter table public.messages drop constraint messages_campaign_household_unique;
alter table public.messages
  add constraint messages_campaign_household_contact_unique
  unique nulls not distinct (campaign_id, household_id, contact_id);

create index messages_contact_id_idx on public.messages (contact_id);

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
        select m.id, m.household_id, m.contact_id
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
               c.value as contact_email,
               case
                 when h.id is null then 'household_missing'
                 when c.id is null then 'no_email'
                 when not v_essential and h.reminders_opt_out then 'opted_out'
               end as skip
          from picked p
          left join public.households h on h.id = p.household_id
          left join public.household_contacts c on c.id = p.contact_id
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
