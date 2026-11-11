-- Text messages: phone numbers become a second kind of household contact. The
-- new enum value gets its own migration because Postgres will not let a value
-- be used in the same transaction that adds it.

alter type public.contact_kind add value if not exists 'phone';
