-- Campaign channel and per-message channel (data-model.md: Changed campaigns,
-- Changed messages). Existing campaigns and messages are email.

create type public.campaign_channel as enum ('email', 'text', 'both');
create type public.message_channel as enum ('email', 'text');

alter table public.campaigns
  add column channel public.campaign_channel not null default 'email';

grant insert (channel) on public.campaigns to authenticated;
grant update (channel) on public.campaigns to authenticated;

-- The channel is content: it cannot change once a campaign is sending or finished.
create function private.campaigns_lock_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('sending', 'done', 'cancelled')
     and new.channel is distinct from old.channel then
    raise exception 'campaign_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.campaigns_lock_channel() from public;

create trigger campaigns_lock_channel
  before update of channel on public.campaigns
  for each row execute function private.campaigns_lock_channel();

alter table public.messages
  add column channel public.message_channel not null default 'email',
  add column to_phone text;

alter table public.messages drop constraint messages_skip_reason_known;
alter table public.messages
  add constraint messages_skip_reason_known
  check (skip_reason in (
    'no_email', 'opted_out', 'already_responded', 'household_missing', 'other',
    'not_opted_in', 'declined', 'texting_unavailable', 'invalid_number', 'no_phone'
  ));

-- Deleting a household forgets the number as well as the address.
create or replace function public.households_forget_message_addresses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set to_email = null, to_phone = null where household_id = old.id;
  return old;
end;
$$;
