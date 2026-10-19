-- Local development data. Everything here is fake: addresses are on
-- example.test, names are invented. Runs after the migrations on `db reset`.

-- Sign-in accounts: two staff and one per household.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'couple@example.test'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'planner@example.test'),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'smith@example.test'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'jones@example.test'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'lee@example.test'),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'patel@example.test'),
  ('20000000-0000-0000-0000-000000000005'::uuid, 'garcia@example.test'),
  ('20000000-0000-0000-0000-000000000006'::uuid, 'novak@example.test')
) as u (id, email);

insert into public.staff (user_id, role, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'couple', 'Seed Couple'),
  ('10000000-0000-0000-0000-000000000002', 'planner', 'Seed Planner');

update public.settings
  set default_rsvp_deadline = '2027-05-01T00:00:00Z',
      rsvp_open = true,
      couple_names = 'Seed Couple';

-- One wedding weekend: three optional events and the two required ones.
insert into public.events (slug, name, starts_at, venue_name, is_required, group_key, display_order) values
  ('welcome-party',   'Welcome party',   '2027-06-11T18:00:00Z', 'Seed Venue One',   false, 'wedding-weekend', 1),
  ('rehearsal',       'Rehearsal',       '2027-06-11T16:00:00Z', 'Seed Venue Two',   false, 'wedding-weekend', 2),
  ('ceremony',        'Ceremony',        '2027-06-12T14:00:00Z', 'Seed Venue Three', true,  'wedding-weekend', 3),
  ('reception',       'Reception',       '2027-06-12T18:00:00Z', 'Seed Venue Three', true,  'wedding-weekend', 4),
  ('farewell-brunch', 'Farewell brunch', '2027-06-13T10:00:00Z', 'Seed Venue Four',  false, 'wedding-weekend', 5);

insert into public.households (id, display_name, contact_email, auth_user_id, plus_one_allowance) values
  ('30000000-0000-0000-0000-000000000001', 'The Smiths',  'smith@example.test',  '20000000-0000-0000-0000-000000000001', 0),
  ('30000000-0000-0000-0000-000000000002', 'The Joneses', 'jones@example.test',  '20000000-0000-0000-0000-000000000002', 0),
  ('30000000-0000-0000-0000-000000000003', 'Frank Lee',   'lee@example.test',    '20000000-0000-0000-0000-000000000003', 1),
  ('30000000-0000-0000-0000-000000000004', 'The Patels',  'patel@example.test',  '20000000-0000-0000-0000-000000000004', 0),
  ('30000000-0000-0000-0000-000000000005', 'Ivan Garcia', 'garcia@example.test', '20000000-0000-0000-0000-000000000005', 0),
  ('30000000-0000-0000-0000-000000000006', 'The Novaks',  'novak@example.test',  '20000000-0000-0000-0000-000000000006', 0);

insert into public.guests (household_id, first_name, last_name, is_placeholder, is_plus_one) values
  ('30000000-0000-0000-0000-000000000001', 'Alice', 'Smith', false, false),
  ('30000000-0000-0000-0000-000000000001', 'Bob', 'Smith', false, false),
  ('30000000-0000-0000-0000-000000000002', 'Carol', 'Jones', false, false),
  ('30000000-0000-0000-0000-000000000002', 'Dan', 'Jones', false, false),
  ('30000000-0000-0000-0000-000000000002', 'Eve', 'Jones', false, false),
  ('30000000-0000-0000-0000-000000000003', 'Frank', 'Lee', false, false),
  ('30000000-0000-0000-0000-000000000003', null, null, true, true),
  ('30000000-0000-0000-0000-000000000004', 'Grace', 'Patel', false, false),
  ('30000000-0000-0000-0000-000000000004', 'Hari', 'Patel', false, false),
  ('30000000-0000-0000-0000-000000000005', 'Ivan', 'Garcia', false, false),
  ('30000000-0000-0000-0000-000000000006', 'Julia', 'Novak', false, false),
  ('30000000-0000-0000-0000-000000000006', 'Karl', 'Novak', false, false);

-- Invitations (all pending):
--   ceremony, reception   everyone
--   welcome-party         households 1 to 4 (including the placeholder plus-one)
--   rehearsal             Alice, Bob, Frank, Ivan
--   farewell-brunch       households 1, 2, 4, 6
insert into public.invitations (guest_id, event_id)
select g.id, e.id
from public.guests g
join public.events e on e.slug in ('ceremony', 'reception');

insert into public.invitations (guest_id, event_id)
select g.id, e.id
from public.guests g
join public.events e on e.slug = 'welcome-party'
where g.household_id in (
  '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004'
);

insert into public.invitations (guest_id, event_id)
select g.id, e.id
from public.guests g
join public.events e on e.slug = 'rehearsal'
where g.first_name in ('Alice', 'Bob', 'Frank', 'Ivan');

insert into public.invitations (guest_id, event_id)
select g.id, e.id
from public.guests g
join public.events e on e.slug = 'farewell-brunch'
where g.household_id in (
  '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000006'
);
