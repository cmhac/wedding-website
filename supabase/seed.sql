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

-- Menus. The reception is the dinner; the rehearsal has its own dinner. Both
-- are published so the guest API has something to return. Dish names are
-- invented, and the tags are what the conflict view checks against.
insert into public.menus (id, event_id, status, notes)
select v.id, e.id, 'published', v.notes
from (values
  ('40000000-0000-0000-0000-000000000001'::uuid, 'reception', 'Seed ceremony-dinner menu'),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'rehearsal', 'Seed rehearsal-dinner menu')
) as v (id, slug, notes)
join public.events e on e.slug = v.slug;

insert into public.courses (id, menu_id, name, display_order, requires_choice) values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Starter', 1, true),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Entrée', 2, true),
  ('41000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'Main', 1, true),
  ('41000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'Dessert', 2, false);

insert into public.dishes (id, course_id, name, description) values
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Seed Tomato Soup', 'Roasted tomato soup'),
  ('42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', 'Seed Prawn Cocktail', 'Prawns in a light sauce'),
  ('42000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000002', 'Seed Pistachio Lamb', 'Lamb with a pistachio crust'),
  ('42000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000002', 'Seed Garden Risotto', 'Seasonal vegetable risotto'),
  ('42000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000002', 'Seed Roast Chicken', 'Roast chicken with herbs'),
  ('42000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000003', 'Seed Lasagne', 'Baked pasta'),
  ('42000000-0000-0000-0000-000000000007', '41000000-0000-0000-0000-000000000003', 'Seed Vegetable Curry', 'Mild curry with rice'),
  ('42000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000004', 'Seed Sponge Cake', 'Vanilla sponge');

-- diet tags mean "suitable for"; allergen tags mean "contains".
insert into public.dish_tags (dish_id, category_key) values
  ('42000000-0000-0000-0000-000000000001', 'vegetarian'),
  ('42000000-0000-0000-0000-000000000001', 'vegan'),
  ('42000000-0000-0000-0000-000000000002', 'shellfish'),
  ('42000000-0000-0000-0000-000000000003', 'nuts'),
  ('42000000-0000-0000-0000-000000000004', 'vegetarian'),
  ('42000000-0000-0000-0000-000000000004', 'gluten-free'),
  ('42000000-0000-0000-0000-000000000006', 'eggs'),
  ('42000000-0000-0000-0000-000000000006', 'wheat'),
  ('42000000-0000-0000-0000-000000000007', 'vegetarian'),
  ('42000000-0000-0000-0000-000000000007', 'vegan'),
  ('42000000-0000-0000-0000-000000000008', 'eggs'),
  ('42000000-0000-0000-0000-000000000008', 'milk');
