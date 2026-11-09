-- The household address moved from a column on households to household_contacts.
begin;
\set helpers_included 1
\ir ../support/helpers.sql

select plan(3);

select hasnt_column('public', 'households', 'contact_email', 'households no longer has contact_email');
select has_column('public', 'household_contacts', 'value', 'household_contacts holds the addresses');
select cmp_ok(
  (select count(*) from public.household_contacts hc
    join public.households h on h.id = hc.household_id),
  '>', 0::bigint, 'the seed households'' addresses are in household_contacts'
);

select * from finish();
rollback;
