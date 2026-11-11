# Data model: Text messages

Changes to the design in [`specs/001-guest-data-model/data-model.md`](../001-guest-data-model/data-model.md) and [`specs/003-personal-invite-links/data-model.md`](../003-personal-invite-links/data-model.md). Postgres (Supabase); every table keeps row-level security; roles as before: **anon**, **guest** (a signed-in household member), **staff** (couple or planner), plus the **service role** used by server routes. This document is the design, not the migration.

## Changed: `household_contacts`

| Change                                                           | Notes                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contact_kind` gains `phone`                                     | its own migration (a new enum value cannot be used in the migration that adds it)                                                                |
| `value` for a phone                                              | E.164 (`+12025550123`), stored as typed by the server after parsing; unique with `kind` across all households, as for email                      |
| check `household_contacts_phone_shape`                           | `kind <> 'phone'` or `value ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'`                                                                                 |
| `sms_consent` `sms_consent_state` not null default `'not_asked'` | enum `not_asked`, `opted_in`, `declined`                                                                                                         |
| `sms_consent_at` timestamptz null                                | when the state last changed away from `not_asked`                                                                                                |
| `sms_consent_source` text null                                   | `first_sign_in` or `sign_in_prompt`                                                                                                              |
| check `household_contacts_consent_only_phone`                    | `kind = 'phone'` or `sms_consent = 'not_asked'`; and `sms_consent = 'not_asked'` ⇔ the other two are null                                        |
| trigger: reset on value change                                   | when `value` changes, `sms_consent` → `not_asked`, `sms_consent_at` and `sms_consent_source` → null (beside the existing delivery-problem reset) |
| trigger: staff-address refusal                                   | already compares an email to staff accounts' emails; a phone value never matches, so it is unchanged (a test proves no false refusal)            |

- **Who can write**: the table-wide `update` grant for `authenticated` is replaced by `update (value)`; `insert` is limited to `(household_id, kind, value)`. A row-level policy limits direct staff writes to `kind = 'email'`. Phone rows are created, changed and removed only by the service-role functions below, after the server has validated the number (research R4). Consent columns are set only by the two consent functions. Guests still read their own household's rows (the guest API masks values).
- **Deletion**: a household's contacts cascade, so numbers and opt-ins go with the household. Changes are recorded in `audit_log` by column name only.

## Changed: `settings`

| Column        | Type    | Default | Notes                                                                                                         |
| ------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `sms_enabled` | boolean | false   | the couple's on/off switch; only the couple's role can change it; no effect unless the provider is configured |

"Configured" is not stored: it is read from the server environment (research R2).

## Changed: `campaigns`

| Column    | Type                                                                         | Notes                                                                                                          |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `channel` | enum `campaign_channel` (`email`, `text`, `both`) not null default `'email'` | locked after the first send like the other campaign fields; added to the staff insert and update column grants |

## Changed: `messages`

| Change                                                                            | Notes                                                                                                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| add `channel` enum `message_channel` (`email`, `text`) not null default `'email'` | existing rows are email                                                                                                            |
| add `to_phone` text null                                                          | the number actually used, written when claimed; forgotten (set null) when the household is deleted, like `to_email`                |
| `skip_reason` check gains                                                         | `not_opted_in`, `declined`, `texting_unavailable`, `invalid_number`, `no_phone`                                                    |
| unique (`campaign_id`, `household_id`, `contact_id`)                              | unchanged: phone contacts have their own ids, so one text per number per campaign                                                  |
| `error_code` for texts                                                            | Twilio's numeric code as text, or `opted_out` (the recipient replied STOP), or `unknown_outcome` (claimed, no SID, 15 minutes old) |

- **Queueing** (in the dispatcher): for a campaign with a text channel and texting available, each household in the audience gets one `queued` text row per phone contact whose `sms_consent` is `opted_in`; every other phone contact of a deliverable household gets a `skipped` row with `not_opted_in` or `declined`. With texting unavailable, text rows are `skipped` with `texting_unavailable` (so nothing is silently dropped). The invitation type has no text wording, so a text channel on it is refused before queueing.
- **Claiming**: `claim_campaign_messages` becomes channel-aware. For a text row it re-reads the contact: removed → `skipped` `no_phone`; no longer `opted_in` → `skipped` `not_opted_in`; reminder opt-out applies as for email. It returns the channel and `to_phone` too. A stale claim (claimed, no SID, over 15 minutes) is re-queued for email, as today, but marked `failed` `unknown_outcome` for text.
- **Delivery events**: `message_events` is reused. The key for Twilio is `<message SID>:<status>` in `provider_event_id`.

## New and changed database functions

| Function                                                                  | Caller               | Purpose                                                                                                                                                        |
| ------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_my_contacts()` (changed)                                             | guest                | also returns each contact's `id` and, for phones, `consent`; the API omits phone entries while texting is unavailable                                          |
| `record_sms_consent(answers jsonb)`                                       | guest                | for each `{contact_id, opt_in}` on the caller's own household, `not_asked` phone contacts only; returns the ids newly opted in                                 |
| `record_sms_consent_for_number(household_id, value)`                      | service role         | sets `opted_in` from `not_asked` or `declined`, source `sign_in_prompt`; returns `{contact_id, newly_opted_in}`                                                |
| `find_phone_contact(value)`                                               | service role         | the household id and contact id for an E.164 number, or nothing                                                                                                |
| `add_phone_contact`, `update_phone_contact`, `remove_phone_contact` (new) | service role         | the phone versions of the email contact functions; the server validates the number first; adding or changing resets consent; the email functions are unchanged |
| `import_households` (unchanged)                                           | staff via the server | phones are saved after the households exist, one `add_phone_contact` call each; the import never carries a consent value                                       |
| `claim_campaign_messages` (changed)                                       | service role         | channel-aware claiming (above)                                                                                                                                 |
| `record_text_status(sid, status, error_code, event_id, occurred_at)`      | service role         | applies a Twilio status with the same ranking and duplicate handling as `record_message_event`; on `failed` flags the contact                                  |
| `households_forget_message_addresses` trigger (changed)                   | database             | also nulls `to_phone`                                                                                                                                          |

## State: a phone number's opt-in

```
not_asked ──ticks box (consent step or sign-in prompt)──▶ opted_in
not_asked ──leaves box unticked (consent step)────────▶ declined
declined  ──ticks box on the sign-in prompt────────────▶ opted_in
any state ──staff change the number's value─────────────▶ not_asked
opted_in  ──guest replies STOP (provider)───────────────▶ stays opted_in here; sends fail with opted_out and flag the number
```

The site keeps no opt-out record: the provider's STOP and START apply (spec: the provider handles stopping). The consent record is only the proof that the guest agreed.
