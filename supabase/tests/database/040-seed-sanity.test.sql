-- Sanity checks on supabase/seed.sql (fake data only). Needs `supabase db reset` to have run the seed.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select plan(16);

-- Fake data only: every seeded email is on example.test.
select is(
  (select count(*) from auth.users where email not like '%@example.test'),
  0::bigint, 'every seeded sign-in address is on example.test'
);
select is(
  (select count(*) from public.households where contact_email is not null and contact_email::text not like '%@example.test'),
  0::bigint, 'every household contact_email is on example.test'
);
select is(
  (select count(*) from public.guests where email is not null and email::text not like '%@example.test'),
  0::bigint, 'every guest email is on example.test'
);

-- Staff and settings.
select is((select count(*) from public.staff where role = 'couple'), 1::bigint, 'one couple staff user');
select is((select count(*) from public.staff where role = 'planner'), 1::bigint, 'one planner staff user');
select isnt((select default_rsvp_deadline from public.settings), null, 'settings has a default deadline');

-- Households and guests.
select is((select count(*) from public.households), 6::bigint, 'six households');
select is(
  (select count(*) from public.households where contact_email is not null and auth_user_id is not null),
  6::bigint, 'every household has an email and a sign-in account'
);
select is((select count(*) from public.guests), 12::bigint, 'twelve guests');
select is((select count(*) from public.guests where is_placeholder), 1::bigint, 'one placeholder plus-one');

-- Events.
select results_eq(
  $$select slug, is_required, group_key from public.events order by display_order$$,
  $$values
    ('welcome-party'::text, false, 'wedding-weekend'::text),
    ('rehearsal', false, 'wedding-weekend'),
    ('ceremony', true, 'wedding-weekend'),
    ('reception', true, 'wedding-weekend'),
    ('farewell-brunch', false, 'wedding-weekend')$$,
  'the five events, with the right required flags and group'
);

-- Invitation subsets.
select is(
  (select count(*) from public.invitations i join public.events e on e.id = i.event_id
    where e.slug in ('ceremony', 'reception')),
  24::bigint, 'every guest is invited to the ceremony and the reception'
);
select is(
  (select count(*) from public.invitations i join public.events e on e.id = i.event_id
    where e.slug = 'welcome-party'),
  9::bigint, 'nine guests are invited to the welcome party'
);
select is(
  (select count(*) from public.invitations i join public.events e on e.id = i.event_id
    where e.slug = 'rehearsal'),
  4::bigint, 'four guests are invited to the rehearsal'
);
select isnt(
  (select array_agg(i.guest_id order by i.guest_id) from public.invitations i join public.events e on e.id = i.event_id where e.slug = 'welcome-party'),
  (select array_agg(i.guest_id order by i.guest_id) from public.invitations i join public.events e on e.id = i.event_id where e.slug = 'rehearsal'),
  'welcome party and rehearsal have different guest lists'
);
select is(
  (select count(*) from public.invitations where status <> 'pending'), 0::bigint,
  'every seeded invitation is pending'
);

select * from finish();
rollback;
