-- Meal selections: the selection rules, history, declining, and the meals and
-- structured dietary parts of submit_household_rsvp and get_my_rsvp.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(49);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset
select tests.create_user('household-b@example.test') as user_b \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'couple', 'Staff');
update public.settings set default_rsvp_deadline = now() + interval '30 days', rsvp_open = true;

insert into public.households (id, display_name, contact_email, auth_user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Household A', 'a@example.test', :'user_a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Household B', 'b@example.test', :'user_b');
insert into public.guests (id, household_id, first_name, last_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ada', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Alan', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Amy', 'Alpha'),
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ann', 'Alpha'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Bea', 'Beta');
insert into public.events (id, slug, name, is_required, display_order) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dinner', 'Dinner', true, 1),
  ('eeeeeeee-0000-0000-0000-000000000002', 'draft-event', 'Draft Event', false, 2),
  ('eeeeeeee-0000-0000-0000-000000000003', 'closed-event', 'Closed Event', false, 3),
  ('eeeeeeee-0000-0000-0000-000000000004', 'other-event', 'Other Event', false, 4);
insert into public.invitations (guest_id, event_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000003', 'attending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-000000000001', 'declined'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'eeeeeeee-0000-0000-0000-000000000001', 'pending'),
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'eeeeeeee-0000-0000-0000-000000000002', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000004', 'attending');

insert into public.dietary_categories (key, label, kind, display_order) values
  ('vegetarian', 'Vegetarian', 'diet', 1), ('nuts', 'Nuts', 'allergen', 2);
insert into public.menus (id, event_id, status) values
  ('11111111-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'published'),
  ('11111111-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002', 'draft'),
  ('11111111-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000003', 'closed'),
  ('11111111-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000004', 'published');
insert into public.courses (id, menu_id, name, display_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Starter', 1),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Main', 2),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'Draft course', 1),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003', 'Closed course', 1),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000004', 'Other course', 1);
insert into public.dishes (id, course_id, name, description, archived_at) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Soup', 'A soup', null),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'Salad', null, null),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'Beef', null, null),
  ('33333333-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 'Veg Bake', null, null),
  ('33333333-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 'Archived Special', null, now()),
  ('33333333-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000003', 'Draft Dish', null, null),
  ('33333333-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000004', 'Closed Dish', null, null),
  ('33333333-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000005', 'Other Dish', null, null);
insert into public.dish_tags (dish_id, category_key) values
  ('33333333-0000-0000-0000-000000000003', 'nuts'),
  ('33333333-0000-0000-0000-000000000004', 'vegetarian');

-- Reading: menus appear only for events the guest attends.
select tests.authenticate_as(:'user_a');
select public.get_my_rsvp()::text as rsvp \gset
select tests.clear_auth();

select results_eq(
  format($$select g ->> 'first_name', i -> 'event' ->> 'slug', i ->> 'status', i ? 'menu', i -> 'menu' ->> 'status'
             from jsonb_array_elements(%L::jsonb -> 'guests') g, jsonb_array_elements(g -> 'invitations') i
            order by 1, 2$$, :'rsvp'),
  $$values
    ('Ada'::text, 'closed-event'::text, 'attending'::text, true, 'closed'::text),
    ('Ada', 'dinner', 'attending', true, 'published'),
    ('Alan', 'dinner', 'declined', false, null),
    ('Amy', 'dinner', 'pending', false, null),
    ('Ann', 'draft-event', 'attending', false, null)$$,
  'a menu is returned only for events the guest attends, and never a draft'
);
select results_eq(
  format($$select c ->> 'name', jsonb_array_length(c -> 'dishes'), (c ->> 'requires_choice')::boolean
             from jsonb_array_elements(%L::jsonb -> 'guests' -> 0 -> 'invitations') i,
                  jsonb_array_elements(i -> 'menu' -> 'courses') c
            where i -> 'event' ->> 'slug' = 'dinner' order by (c ->> 'display_order')::int$$, :'rsvp'),
  $$values ('Starter'::text, 2, true), ('Main', 2, true)$$,
  'the menu lists its courses with their non-archived dishes'
);
select results_eq(
  format($$select d ->> 'name', d ->> 'description', d -> 'tags'
             from jsonb_array_elements(%L::jsonb -> 'guests' -> 0 -> 'invitations') i,
                  jsonb_array_elements(i -> 'menu' -> 'courses') c, jsonb_array_elements(c -> 'dishes') d
            where i -> 'event' ->> 'slug' = 'dinner' and c ->> 'name' = 'Main' order by d ->> 'name'$$, :'rsvp'),
  $$values ('Beef'::text, null::text, '["nuts"]'::jsonb), ('Veg Bake', null, '["vegetarian"]')$$,
  'dishes carry their tags'
);
select ok(
  position('Archived Special' in :'rsvp') = 0 and position('Draft Dish' in :'rsvp') = 0 and position('Other Dish' in :'rsvp') = 0,
  'archived dishes, draft menus, and menus for events the household is not invited to never appear'
);
select results_eq(
  format($$select c ->> 'key', c ->> 'label', c ->> 'kind' from jsonb_array_elements(%L::jsonb -> 'dietary_categories') c$$, :'rsvp'),
  $$values ('vegetarian'::text, 'Vegetarian'::text, 'diet'::text), ('nuts', 'Nuts', 'allergen')$$,
  'the dietary categories are returned in display order'
);
select is(
  (select jsonb_array_length(g -> 'dietary') from jsonb_array_elements((:'rsvp'::jsonb) -> 'guests') g where g ->> 'first_name' = 'Ada'),
  0, 'a guest with no restrictions has an empty dietary list'
);

-- Choosing meals through the RPC.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1",
    "meals": [{"course_id": "22222222-0000-0000-0000-000000000001", "dish_id": "33333333-0000-0000-0000-000000000001"},
              {"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000003"}]}]}$json$::jsonb)::text as saved \gset
select tests.clear_auth();
select results_eq(
  $$select course_id::text, dish_id::text, chosen_by from public.meal_selections where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' order by course_id$$,
  format($$values ('22222222-0000-0000-0000-000000000001'::text, '33333333-0000-0000-0000-000000000001'::text, %1$L::uuid),
                  ('22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003', %1$L::uuid)$$, :'user_a'),
  'meals are saved with who chose them'
);
select results_eq(
  format($$select s ->> 'course_id', s ->> 'dish_id'
             from jsonb_array_elements(%L::jsonb -> 'guests' -> 0 -> 'invitations') i, jsonb_array_elements(i -> 'menu' -> 'selection') s
            where i -> 'event' ->> 'slug' = 'dinner' order by 1$$, :'saved'),
  $$values ('22222222-0000-0000-0000-000000000001'::text, '33333333-0000-0000-0000-000000000001'::text),
           ('22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003')$$,
  'the response returns the guest selections'
);
select results_eq(
  $$select old_dish_id is null, new_dish_id::text, reason, changed_by from public.meal_selection_history order by id$$,
  format($$values (true, '33333333-0000-0000-0000-000000000001'::text, 'changed'::text, %1$L::uuid),
                  (true, '33333333-0000-0000-0000-000000000003', 'changed', %1$L::uuid)$$, :'user_a'),
  'first choices are written to the history'
);
select is(
  (select count(*) from public.audit_log where entity = 'meal_selections' and actor_kind = 'guest' and action = 'insert'),
  2::bigint, 'meal choices are audited as the guest'
);

-- Changing a choice records the old and new dish.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1",
    "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000004"}]}]}$json$::jsonb);
select tests.clear_auth();
select results_eq(
  $$select old_dish_id::text, new_dish_id::text, reason from public.meal_selection_history order by id desc limit 1$$,
  $$values ('33333333-0000-0000-0000-000000000003'::text, '33333333-0000-0000-0000-000000000004'::text, 'changed'::text)$$,
  'changing a choice records the old and the new dish'
);

-- Re-sending an unchanged choice writes no history.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1",
    "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000004"}]}]}$json$::jsonb);
select tests.clear_auth();
select is((select count(*) from public.meal_selection_history), 3::bigint, 'an unchanged choice writes no history');

-- Rejected meals: invalid_meal, atomically.
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a2", "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000003"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'a guest who declined cannot choose a meal'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a3", "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000003"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'a guest who has not said they are attending cannot choose a meal'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a4", "meals": [{"course_id": "22222222-0000-0000-0000-000000000003", "dish_id": "33333333-0000-0000-0000-000000000006"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'a guest cannot choose from a draft menu'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "22222222-0000-0000-0000-000000000004", "dish_id": "33333333-0000-0000-0000-000000000007"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'a guest cannot choose from a closed menu'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000005"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'a guest cannot choose an archived dish'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "22222222-0000-0000-0000-000000000001", "dish_id": "33333333-0000-0000-0000-000000000003"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'the dish must belong to the course'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "22222222-0000-0000-0000-000000000005", "dish_id": "33333333-0000-0000-0000-000000000008"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'a guest cannot choose for an event they are not invited to'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "99999999-0000-0000-0000-000000000009", "dish_id": "33333333-0000-0000-0000-000000000003"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'a course that does not exist is invalid_meal'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "22222222-0000-0000-0000-000000000002"}]}]}'::jsonb)$$,
  'P0001', 'invalid_payload', 'a meal without a dish is an invalid payload'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1",
      "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "declined"}],
      "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000003"}]}]}'::jsonb)$$,
  'P0001', 'invalid_meal', 'choosing a meal for an event declined in the same payload is rejected, not ignored'
);
select tests.clear_auth();
select results_eq(
  $$select (select status::text from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
          (select dish_id::text from public.meal_selections where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and course_id = '22222222-0000-0000-0000-000000000002')$$,
  $$values ('attending'::text, '33333333-0000-0000-0000-000000000004'::text)$$,
  'the refused payload changed nothing'
);

-- Structured dietary data.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1",
    "dietary": [{"category_key": "nuts", "severity": "allergy", "details": "carries a pen"},
                {"category_key": "vegetarian", "severity": "preference", "details": null}]}]}$json$::jsonb)::text as saved \gset
select tests.clear_auth();
select results_eq(
  format($$select d ->> 'category_key', d ->> 'severity', d ->> 'details'
             from jsonb_array_elements(%L::jsonb -> 'guests' -> 0 -> 'dietary') d order by 1$$, :'saved'),
  $$values ('nuts'::text, 'allergy'::text, 'carries a pen'::text), ('vegetarian', 'preference', null)$$,
  'dietary rows are saved and returned'
);
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp($json$
  {"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1",
    "dietary": [{"category_key": "nuts", "severity": "preference", "details": "just dislikes them"}]}]}$json$::jsonb);
select tests.clear_auth();
select results_eq(
  $$select category_key, severity, details from public.guest_dietary where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'$$,
  $$values ('nuts'::text, 'preference'::text, 'just dislikes them'::text)$$,
  'the submitted list replaces the old one'
);
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "dietary": [{"category_key": "no-such", "severity": "allergy"}]}]}'::jsonb)$$,
  'P0001', 'invalid_payload', 'an unknown dietary category is an invalid payload'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "dietary": [{"category_key": "nuts", "severity": "severe"}]}]}'::jsonb)$$,
  'P0001', 'invalid_payload', 'severity must be allergy or preference'
);
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "dietary": "nuts"}]}'::jsonb)$$,
  'P0001', 'invalid_payload', 'dietary must be a list'
);
select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "dietary": []}]}'::jsonb);
select tests.clear_auth();
select is(
  (select count(*) from public.guest_dietary where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 0::bigint,
  'an empty list clears the structured dietary data'
);

-- Deadlines apply to meal choices; an unchanged choice is never an error.
update public.households set rsvp_deadline_override = '2000-01-01T00:00:00Z' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000003"}]}]}'::jsonb)$$,
  'P0001', 'rsvp_closed', 'changing a meal after the deadline raises rsvp_closed'
);
select lives_ok(
  $$select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "meals": [{"course_id": "22222222-0000-0000-0000-000000000002", "dish_id": "33333333-0000-0000-0000-000000000004"}]}]}'::jsonb)$$,
  'an unchanged meal after the deadline is not an error'
);
select tests.clear_auth();
update public.households set rsvp_deadline_override = null where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

-- Declining through the RPC removes the guest's meals for that event.
select tests.authenticate_as(:'user_a');
select public.submit_household_rsvp('{"guests": [{"guest_id": "aaaaaaaa-0000-0000-0000-0000000000a1", "responses": [{"event_id": "eeeeeeee-0000-0000-0000-000000000001", "status": "declined"}]}]}'::jsonb);
select tests.clear_auth();
select is(
  (select count(*) from public.meal_selections where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 0::bigint,
  'declining an event removes that guest''s meal selections'
);
select results_eq(
  $$select old_dish_id::text, new_dish_id is null, reason, changed_by from public.meal_selection_history
     where reason = 'declined' order by old_dish_id$$,
  format($$values ('33333333-0000-0000-0000-000000000001'::text, true, 'declined'::text, %1$L::uuid),
                  ('33333333-0000-0000-0000-000000000004', true, 'declined', %1$L::uuid)$$, :'user_a'),
  'and the history keeps what they had chosen, with the reason declined'
);
select is(
  (select count(*) from public.meal_selection_history where guest_id is null), 0::bigint,
  'history rows still point at the guest until the guest is deleted'
);

-- Direct writes: the rules hold for staff as well (staff may use draft and closed menus).
delete from public.meal_selections;
delete from public.meal_selection_history;
update public.invitations set status = 'attending'
 where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and event_id = 'eeeeeeee-0000-0000-0000-000000000001';
delete from public.meal_selection_history;

select tests.authenticate_as(:'staff_user');
select lives_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003')$$,
  'staff can record an attending guest''s choice'
);
select throws_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a2', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003')$$,
  'P0001', 'invalid_meal', 'a selection for a declined guest is refused'
);
select throws_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a3', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003')$$,
  'P0001', 'invalid_meal', 'a selection for a pending guest is refused'
);
select throws_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a4', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')$$,
  'P0001', 'invalid_meal', 'a selection for an event the guest is not invited to is refused'
);
select throws_ok(
  $$update public.meal_selections set dish_id = '33333333-0000-0000-0000-000000000005' where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'$$,
  'P0001', 'invalid_meal', 'switching to an archived dish is refused'
);
select throws_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003')$$,
  '23503', null, 'the composite foreign key refuses a dish from another course'
);
select lives_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a4', '22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000006')$$,
  'staff can record a choice on a draft menu'
);
select lives_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000007')$$,
  'staff can record a choice on a closed menu'
);

-- Leaving "attending" removes the choices, with history.
select public.staff_set_rsvp('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'attending');
select lives_ok(
  $$insert into public.meal_selections (guest_id, course_id, dish_id) values ('bbbbbbbb-0000-0000-0000-0000000000b1', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003')$$,
  'staff can record a choice for another household'
);
select public.staff_set_rsvp('bbbbbbbb-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-000000000001', 'pending');
select is(
  (select count(*) from public.meal_selections where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b1'), 0::bigint,
  'putting an answer back to pending also removes the choices'
);
select results_eq(
  $$select reason from public.meal_selection_history where guest_id = 'bbbbbbbb-0000-0000-0000-0000000000b1' order by id desc limit 1$$,
  $$values ('changed'::text)$$, 'with the reason changed'
);

-- Removing an invitation, a guest, or an event with choices attached works and leaves no orphans.
delete from public.invitations where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a4';
select is(
  (select count(*) from public.meal_selections where guest_id = 'aaaaaaaa-0000-0000-0000-0000000000a4'), 0::bigint,
  'removing an invitation removes the choices for it'
);
select lives_ok($$delete from public.guests where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'$$, 'a guest with choices can be deleted');
select lives_ok($$delete from public.events where id = 'eeeeeeee-0000-0000-0000-000000000003'$$, 'an event with a menu can be deleted');
select tests.clear_auth();

select ok(
  not exists (select 1 from public.meal_selection_history h where h.guest_id is not null and not exists (select 1 from public.guests g where g.id = h.guest_id)),
  'no history row points at a deleted guest'
);

select * from finish();
rollback;
