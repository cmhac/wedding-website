-- import_households (all-or-nothing per household, per-row errors) and
-- find_duplicate_households (flags, never merges). Fake data only.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select tests.clear_data();

select plan(40);

select tests.create_user('staff@example.test') as staff_user \gset
select tests.create_user('household-a@example.test') as user_a \gset

insert into public.staff (user_id, role, display_name) values (:'staff_user', 'couple', 'Staff');
insert into public.households (id, display_name, contact_email, auth_user_id)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Existing Household', 'taken@example.test', :'user_a');
insert into public.events (slug, name, is_required, display_order) values
  ('welcome', 'Welcome', false, 1),
  ('ceremony', 'Ceremony', true, 2);

-- Callers who are not staff.
select tests.authenticate_as(:'user_a');
select throws_ok(
  $$select public.import_households('[]'::jsonb)$$, 'P0001', 'forbidden',
  'a guest cannot import households'
);
select throws_ok(
  $$select * from public.find_duplicate_households()$$, 'P0001', 'forbidden',
  'a guest cannot look for duplicates'
);
select tests.clear_auth();
select tests.authenticate_anon();
select throws_ok(
  $$select public.import_households('[]'::jsonb)$$, '42501', null,
  'anon cannot import households'
);
select throws_ok(
  $$select * from public.find_duplicate_households()$$, '42501', null,
  'anon cannot look for duplicates'
);
select tests.clear_auth();

-- A good import by staff.
select tests.authenticate_as(:'staff_user');
select public.import_households($json$[
  {"ref": "h1", "display_name": "Import One", "contact_email": "one@example.test",
   "paper_only": false, "plus_one_allowance": 1,
   "guests": [
     {"row": 2, "first_name": "Ann", "last_name": "One", "email": "ann@example.test",
      "dietary_notes": "no onions", "notes": "staff note", "events": ["welcome", "ceremony"]},
     {"row": 3, "first_name": "Ben", "last_name": "One", "events": ["ceremony"]}
   ]},
  {"ref": "h2", "display_name": "Paper Household", "contact_email": null,
   "paper_only": true, "plus_one_allowance": 0,
   "guests": [
     {"row": 4, "first_name": "Cat", "last_name": "Two", "events": []}
   ]}
]$json$::jsonb)::text as res \gset
select tests.clear_auth();

select is((:'res'::jsonb) #>> '{created,households}', '2', 'two households created');
select is((:'res'::jsonb) #>> '{created,guests}', '3', 'three guests created');
select is((:'res'::jsonb) #>> '{created,invitations}', '3', 'three invitations created');
select is(jsonb_array_length((:'res'::jsonb) -> 'errors'), 0, 'no errors for a clean import');
select is(jsonb_array_length((:'res'::jsonb) -> 'household_ids'), 2, 'the new household ids are returned with their refs');
select is(
  (select count(*) from public.households h
    where h.id::text in (select x ->> 'household_id' from jsonb_array_elements((:'res'::jsonb) -> 'household_ids') x)
      and h.display_name in ('Import One', 'Paper Household')),
  2::bigint, 'the returned ids are the created households'
);
select is(
  (select plus_one_allowance from public.households where display_name = 'Import One'),
  1::smallint, 'plus-one allowance is stored'
);
select is(
  (select contact_email is null from public.households where display_name = 'Paper Household'),
  true, 'a paper-only household has no contact email'
);
select is(
  (select auth_user_id is null from public.households where display_name = 'Import One'),
  true, 'import does not create sign-in accounts'
);
select results_eq(
  $$select g.first_name, g.dietary_notes, g.notes, g.email::text, g.is_placeholder, g.is_plus_one
      from public.guests g where g.first_name = 'Ann'$$,
  $$values ('Ann'::text, 'no onions'::text, 'staff note'::text, 'ann@example.test'::text, false, false)$$,
  'guest fields are stored'
);
select results_eq(
  $$select e.slug from public.invitations i
      join public.guests g on g.id = i.guest_id join public.events e on e.id = i.event_id
     where g.first_name = 'Ann' order by e.slug$$,
  $$values ('ceremony'::text), ('welcome')$$,
  'invitations follow the event slugs'
);
select is(
  (select count(*) from public.invitations where invited_by = :'staff_user'),
  3::bigint, 'invitations record the staff member who imported'
);
select results_eq(
  $$select actor_kind from public.audit_log where entity = 'households' and action = 'insert'
      and entity_id in (select id from public.households where display_name = 'Import One')$$,
  $$values ('couple'::text)$$,
  'the import is attributed to the staff member in the audit log'
);

-- A household with an invalid row is not created; valid ones in the same call are.
select tests.authenticate_as(:'staff_user');
select public.import_households($json$[
  {"ref": "good", "display_name": "Good Household", "contact_email": "good@example.test",
   "paper_only": false, "plus_one_allowance": 0,
   "guests": [{"row": 10, "first_name": "Gus", "last_name": "Good", "events": ["ceremony"]}]},
  {"ref": "bad", "display_name": "Bad Household", "contact_email": "bad@example.test",
   "paper_only": false, "plus_one_allowance": 0,
   "guests": [
     {"row": 11, "first_name": "Fine", "last_name": "Bad", "events": ["ceremony"]},
     {"row": 12, "first_name": "Odd", "last_name": "Bad", "events": ["no-such-event"]}
   ]}
]$json$::jsonb)::text as res \gset
select tests.clear_auth();

select is((:'res'::jsonb) #>> '{created,households}', '1', 'only the valid household is created');
select is((:'res'::jsonb) #>> '{created,guests}', '1', 'only the valid household guests are created');
select is(
  (select count(*) from public.households where display_name = 'Bad Household'), 0::bigint,
  'a household with one invalid row is not created at all'
);
select is(
  (select count(*) from public.guests where last_name = 'Bad'), 0::bigint,
  'none of its guests are created either'
);
select results_eq(
  format($$select (e ->> 'row')::int, e ->> 'field' from jsonb_array_elements(%L::jsonb -> 'errors') e$$, :'res'),
  $$values (12, 'events'::text)$$,
  'the error carries the row number and the field'
);
select ok(
  (select bool_and(e ? 'message' and length(e ->> 'message') > 0) from jsonb_array_elements((:'res'::jsonb) -> 'errors') e),
  'the error carries a reason'
);

-- Other validation, one household each so every case is reported.
select tests.authenticate_as(:'staff_user');
select public.import_households($json$[
  {"ref": "e1", "display_name": "Bad Email", "contact_email": "not-an-email", "paper_only": false,
   "plus_one_allowance": 0, "guests": [{"row": 20, "first_name": "A", "last_name": "B", "events": []}]},
  {"ref": "e2", "display_name": "Taken Email", "contact_email": "TAKEN@example.test", "paper_only": false,
   "plus_one_allowance": 0, "guests": [{"row": 21, "first_name": "A", "last_name": "C", "events": []}]},
  {"ref": "e3", "display_name": "Negative", "contact_email": "neg@example.test", "paper_only": false,
   "plus_one_allowance": -1, "guests": [{"row": 22, "first_name": "A", "last_name": "D", "events": []}]},
  {"ref": "e4", "display_name": "Same Names", "contact_email": "same@example.test", "paper_only": false,
   "plus_one_allowance": 0, "guests": [
     {"row": 23, "first_name": "Zed", "last_name": "Same", "events": []},
     {"row": 24, "first_name": "ZED", "last_name": "same", "events": []}]},
  {"ref": "e5", "display_name": "Paper With Email", "contact_email": "paper@example.test", "paper_only": true,
   "plus_one_allowance": 0, "guests": [{"row": 25, "first_name": "A", "last_name": "E", "events": []}]},
  {"ref": "e6", "display_name": "  ", "contact_email": null, "paper_only": true,
   "plus_one_allowance": 0, "guests": [{"row": 26, "first_name": "A", "last_name": "F", "events": []}]},
  {"ref": "e7", "row": 27, "display_name": "No Guests", "contact_email": null, "paper_only": true,
   "plus_one_allowance": 0, "guests": []},
  {"ref": "e8", "display_name": "Missing Name", "contact_email": null, "paper_only": true,
   "plus_one_allowance": 0, "guests": [{"row": 28, "first_name": "", "last_name": "G", "events": []}]},
  {"ref": "e9", "display_name": "Guest Bad Email", "contact_email": null, "paper_only": true,
   "plus_one_allowance": 0, "guests": [{"row": 29, "first_name": "A", "last_name": "H", "email": "nope", "events": []}]},
  {"ref": "e10", "display_name": "Allowance Text", "contact_email": null, "paper_only": true,
   "plus_one_allowance": "two", "guests": [{"row": 30, "first_name": "A", "last_name": "I", "events": []}]}
]$json$::jsonb)::text as res \gset
select tests.clear_auth();

select is((:'res'::jsonb) #>> '{created,households}', '0', 'every invalid household is refused');
select results_eq(
  format($$select (e ->> 'row')::int, e ->> 'field' from jsonb_array_elements(%L::jsonb -> 'errors') e order by 1, 2$$, :'res'),
  $$values
    (20, 'contact_email'::text),
    (21, 'contact_email'),
    (22, 'plus_one_allowance'),
    (24, 'first_name'),
    (25, 'contact_email'),
    (26, 'display_name'),
    (27, 'guests'),
    (28, 'first_name'),
    (29, 'email'),
    (30, 'plus_one_allowance')$$,
  'each invalid household reports its row and field (a household-level error uses its first guest row)'
);
select is(
  (select count(*) from public.households), 4::bigint,
  'only the three valid households (and the fixture) exist'
);

-- Two households in one call cannot share a contact email; the second is refused.
select tests.authenticate_as(:'staff_user');
select public.import_households($json$[
  {"ref": "d1", "display_name": "First Twin", "contact_email": "twin@example.test", "paper_only": false,
   "plus_one_allowance": 0, "guests": [{"row": 40, "first_name": "A", "last_name": "T1", "events": []}]},
  {"ref": "d2", "display_name": "Second Twin", "contact_email": "Twin@example.test", "paper_only": false,
   "plus_one_allowance": 0, "guests": [{"row": 41, "first_name": "A", "last_name": "T2", "events": []}]}
]$json$::jsonb)::text as res \gset
select tests.clear_auth();
select is((:'res'::jsonb) #>> '{created,households}', '1', 'the first of two households sharing an email is created');
select results_eq(
  format($$select (e ->> 'row')::int, e ->> 'field' from jsonb_array_elements(%L::jsonb -> 'errors') e$$, :'res'),
  $$values (41, 'contact_email'::text)$$,
  'the second is refused'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements((:'res'::jsonb) -> 'errors') e
     where e ->> 'message' ilike '%Existing Household%' or e ->> 'message' ilike '%First Twin%'
  ),
  'an email clash names no other household'
);

-- The service role (route handlers) may import, with no signed-in user.
select tests.authenticate_service_role();
select public.import_households($json$[
  {"ref": "s1", "display_name": "Service Import", "contact_email": "service@example.test", "paper_only": false,
   "plus_one_allowance": 0, "guests": [{"row": 50, "first_name": "Sam", "last_name": "Service", "events": ["ceremony"]}]}
]$json$::jsonb)::text as res \gset
select tests.clear_auth();
select is((:'res'::jsonb) #>> '{created,households}', '1', 'the service role can import');
select results_eq(
  $$select actor_kind from public.audit_log where entity = 'households' and action = 'insert'
      and entity_id in (select id from public.households where display_name = 'Service Import')$$,
  $$values ('system'::text)$$,
  'a service-role import is audited as system'
);

-- Possible duplicates: same normalized name or address; flagged, never merged.
insert into public.households (id, display_name, address) values
  ('dddddddd-0000-0000-0000-000000000001', 'The Smiths',
    '{"street": "1 Example Road", "city": "Testville", "postal_code": "AB1 2CD"}'),
  ('dddddddd-0000-0000-0000-000000000002', ' the  SMITHS. ', null),
  ('dddddddd-0000-0000-0000-000000000003', 'Jones Family',
    '{"city": "TESTVILLE", "street": "1 example road", "postal_code": "ab1 2cd"}'),
  ('dddddddd-0000-0000-0000-000000000004', 'Unrelated', '{"street": "9 Other Street"}');

select tests.authenticate_as(:'staff_user');
select results_eq(
  $$select household_a::text, household_b::text, reasons from public.find_duplicate_households()
     where household_a::text like 'dddddddd%' order by 1, 2$$,
  $$values
    ('dddddddd-0000-0000-0000-000000000001'::text, 'dddddddd-0000-0000-0000-000000000002'::text, array['display_name']::text[]),
    ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', array['address'])$$,
  'duplicates are flagged by normalized name and by address'
);
select is(
  (select count(*) from public.find_duplicate_households() where household_b = 'dddddddd-0000-0000-0000-000000000004'
     or household_a = 'dddddddd-0000-0000-0000-000000000004'),
  0::bigint, 'an unrelated household is not flagged'
);
select tests.clear_auth();
select is(
  (select count(*) from public.households where id::text like 'dddddddd%'), 4::bigint,
  'flagging merges nothing'
);

select * from finish();
rollback;
