# Contract: Email template interface

**Email content is out of scope for this feature.** It writes no subject lines, body copy, or email designs, and ships no templates. Someone else supplies them (the designer, or whoever writes the emails). This contract defines how a supplied template plugs into sending, so the sending code can be built and tested without any real content.

## Registry

`emails/index.ts` default-exports a record of templates keyed by template key. This feature creates the file empty. Supplied templates are added to it later.

```ts
export type RenderedEmail = { subject: string; html: string; text: string };
export type EmailTemplate<P> = (
  props: P,
) => RenderedEmail | Promise<RenderedEmail>;
// emails/index.ts
export default {
  /* save_the_date: ..., invitation: ..., */
} satisfies Record<string, EmailTemplate<never>>;
```

`src/lib/email/templates.ts` provides `getTemplate(key)`, which returns the template or throws `template_missing`. A template that throws surfaces as `template_failed`. A template is a pure function: no network or database access, no logging, and no `from` address (the sender comes from `EMAIL_FROM`).

## Template keys and props

| Key                        | Used for                                      | Props                                           |
| -------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `magic_link`               | Sign-in link (Supabase Send Email hook)       | `{ sign_in_url, audience: "guest" \| "staff" }` |
| `save_the_date`            | Campaign message                              | campaign props below                            |
| `invitation`               | Campaign message                              | campaign props below                            |
| `rsvp_reminder`            | Campaign message                              | campaign props below                            |
| `optional_events_reminder` | Campaign message                              | campaign props below                            |
| `update`                   | Campaign message (essential, ignores opt-out) | campaign props below                            |

Campaign props are the only data a template receives. They contain no email address, postal address, dietary data, or notes:

```ts
type CampaignProps = {
  household: { display_name: string };
  rsvp_url: string; // `NEXT_PUBLIC_SITE_URL` plus `GUEST_RSVP_PATH` (default `/rsvp`), where the guest frontend serves the RSVP
  respond_by: string | null; // earliest open deadline, ISO
  events: {
    slug: string;
    name: string;
    starts_at: string;
    venue_name: string;
    is_required: boolean;
    status: "pending" | "attending" | "declined";
  }[];
  pending: { required_events: number; optional_events: number; meals: number };
};
```

`message_types.template_key` is a key into this registry. The registry may hold templates for keys this feature does not use; unknown keys are ignored.

## Behavior when a template is missing

- `POST /api/admin/campaigns/[id]/send` returns `409 template_missing` before any message row is created.
- The scheduled dispatch leaves the campaign `scheduled`, records `campaigns.last_error_code = 'template_missing'`, and processes the other due campaigns.
- The Send Email hook returns `500 template_missing`. Production keeps the hook disabled until a `magic_link` template is registered; local development leaves it off and uses Supabase's built-in email with local mail capture.

## Tests

All tests use fixture templates under `src/lib/email/__tests__/fixtures/` (placeholder strings, never real copy). Tests cover: a registered key renders `{subject, html, text}`, a missing key throws `template_missing`, a throwing template becomes `template_failed`, and the props passed to a template contain exactly the fields above.
