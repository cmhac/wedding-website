-- Extensions and enumerated types shared by every later migration.

-- Case-insensitive text, used for email addresses. Lives in the `extensions`
-- schema, which is on the API search path.
create extension if not exists citext with schema extensions;

create type public.staff_role as enum ('couple', 'planner');
create type public.rsvp_status as enum ('pending', 'attending', 'declined');
create type public.menu_status as enum ('draft', 'published', 'closed');
create type public.campaign_status as enum ('draft', 'scheduled', 'sending', 'done', 'cancelled');
create type public.message_status as enum (
  'queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped'
);
create type public.dietary_kind as enum ('diet', 'allergen');
