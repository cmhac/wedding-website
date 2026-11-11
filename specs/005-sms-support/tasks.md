---
description: "Task list for text messages as a first-class way to sign in and be messaged"
---

# Tasks: Text messages

**Input**: Design documents from `specs/005-sms-support/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. The constitution's first principle is test-first: every test task below is written and seen failing before the implementation task that follows it. Code gets Jest tests in `__tests__` directories next to the source; database changes get pgTAP tests in `supabase/tests/database`.

**Organization**: By user story from the spec, in priority order, after a shared foundation. The availability story (US8) comes first among the stories because every other story must respect it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the spec's user story (US1 to US8)
- "Research" names the decision of that title in [research.md](./research.md).
- Never write a real phone number or guest detail in a fixture: use numbers from `(202) 555-0100` to `(202) 555-0199`. Never log a number or a message body.
- `src/types/database.ts` is generated and must not be hand-edited. If the local database cannot start (check `docker info`), write the migrations and database tests anyway, say in the commit message that they could not be run, and use the loosely typed database client the dispatcher already uses.

---

## Phase 1: Setup

- [x] T001 Merge `origin/main` into the branch (`git merge origin/main`) so the public privacy and terms pages, the `twilio/` screenshots folder and `src/lib/site/legal.ts` are present; resolve any conflict in `CLAUDE.md` by keeping both sets of text. Run `npm ci`, then `npm run lint`, `npm run type-check` and `npm test`, and note the starting result in the first commit message
- [x] T002 Add the two dependencies at their newest versions with `npm install twilio libphonenumber-js` (server-side only; neither is imported from a client component). Add the new variable names to `.env.example` with comments: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (preferred) and `TWILIO_FROM_NUMBER` (alternative), all server-only, "texting stays off and hidden until these are set"

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared pieces every story uses: the availability state, number parsing, the Twilio wrapper, text wording, and the database changes.

- [x] T003 [P] Tests first, then `src/lib/sms/phone.ts` (Research: Recognising United States numbers), tests in `src/lib/sms/__tests__/phone.test.ts`: `parseUsPhone(input)` returns `{ ok: true, e164 }` for `(202) 555-0123`, `202-555-0123`, `+1 202 555 0123`, `1 (202) 555-0123`, `202.555.0123`; returns `{ ok: false, reason: "not_us" }` for `(416) 555-0123` (Canada) and `(876) 555-0123` (Jamaica); `{ ok: false, reason: "invalid" }` for `555-0100`, a too-short number, a too-long number, letters, an empty string and a value with an extension; `maskPhone("+12025550123")` returns `(•••) •••-0123`; `looksLikePhone(value)` is false for any value containing `@`. Use `libphonenumber-js/max`
- [x] T004 [P] Tests first, then `src/lib/sms/state.ts` (Research: What "configured" and "available" mean in code), tests in `src/lib/sms/__tests__/state.test.ts`: `isSmsConfigured(env)` is true only when `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are non-empty and at least one of `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` is non-empty; whitespace-only counts as empty; `getSmsState(db?, env?)` returns `{ configured, enabled, available }` where `enabled` is `settings.sms_enabled` and `available = configured && enabled`; when not configured it does not read the database at all; a database error counts as not enabled (fails closed). Mark the file server-only
- [x] T005 [P] Tests first, then `src/lib/sms/twilio.ts` and `src/lib/sms/send.ts` (Research: Sending a text, and never sending twice), tests in `src/lib/sms/__tests__/send.test.ts` with a fake client: `sendText({ to, body, statusCallback?, client? })` calls `messages.create` with the messaging service or the from number, the recipient, the body and the callback URL; returns `{ ok: true, sid }` or `{ ok: false, code }` where `code` is Twilio's numeric code as a string, `"opted_out"` for error 21610, or `"send_failed"` for anything else; never returns or logs Twilio's message text, the number or the body; returns `{ ok: false, code: "not_configured" }` without calling anything when not configured; refuses a recipient that fails `parseUsPhone` with `"invalid_number"` before any call (the guard just before sending). Only `twilio.ts` imports the `twilio` package
- [x] T006 [P] Tests first, then `src/lib/sms/status.ts`, tests in `src/lib/sms/__tests__/status.test.ts`: `statusForTwilio(status)` maps `queued` and `sending` to `sending`, `sent` to `sent`, `delivered` to `delivered`, `undelivered` and `failed` to `failed`, anything else (`read`, `accepted`, unknown) to `null`; `plainErrorReason(code)` returns plain English for `opted_out` and 21610 ("The recipient replied STOP"), 30003, 30005, 30006 and 30007, `unknown_outcome` ("Sent but not confirmed: check Twilio before re-sending"), `invalid_number`, and `"Twilio error NNNNN"` for any other code. **Verify the five codes against Twilio's error dictionary while writing**
- [x] T007 [P] Tests first, then the text registry under `texts/` (Research: Text wording is registered like email templates; contract [text-templates.md](./contracts/text-templates.md)), tests in `texts/__tests__/texts.test.ts`: `texts/index.ts` registers exactly `sms_sign_in`, `sms_confirmation`, `rsvp_reminder`, `update` and `optional_events_reminder` and no `invitation` or `save_the_date`; each module is a function from props to a plain string; every text rendered with realistic props (a site address of about 40 characters and a household link of the real shape) is at most 160 characters and contains only GSM-7 characters; every text names "Chris & Hannah's wedding" or `hannahandchris.wedding`; the sign-in text, reminder and update contain the link; the confirmation contains "Msg & data rates may apply" and "Reply HELP for help, STOP to opt out"; every other text contains "STOP"; no text contains a name. Then write the five modules as first drafts consistent with the sample texts registered with Twilio (the registration samples are in the session history and `twilio/` screenshots; keep wording and the "about a dozen msgs over 6 months" line aligned). Add `getText(key, registry?)` and `renderText(key, props, registry?)` to `src/lib/email/templates.ts`'s neighbour `src/lib/sms/texts.ts`, throwing the same `template_missing` and `template_failed` codes
- [x] T008 Migration, `supabase/migrations/<timestamp>_phone_contact_kind.sql`: `alter type public.contact_kind add value 'phone';` only (a new enum value cannot be used in the migration that adds it)
- [x] T009 Database tests first in `supabase/tests/database/sms_contacts.test.sql`, then migration `<timestamp>_phone_contacts_and_consent.sql` (data-model: Changed `household_contacts`, Changed `settings`): create `public.sms_consent_state` enum (`not_asked`, `opted_in`, `declined`); add to `household_contacts` the columns `sms_consent` (not null default `'not_asked'`), `sms_consent_at` (timestamptz null) and `sms_consent_source` (text null, check in `first_sign_in`, `sign_in_prompt`); add check `household_contacts_phone_shape` (`kind <> 'phone'` or `value ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'`) and check `household_contacts_consent_only_phone` (`kind = 'phone'` or `sms_consent = 'not_asked'`, and `not_asked` exactly when `sms_consent_at` and `sms_consent_source` are null); a before-update trigger resetting all three to `not_asked`/null when `value` changes; replace the table-wide `update` grant for `authenticated` with `update (value)` and limit `insert` to `(household_id, kind, value)`; add a staff policy so direct writes are allowed only where `kind = 'email'` (reads unchanged); add `settings.sms_enabled boolean not null default false`, writable only by the couple role (follow how `rsvp_open` is guarded). Tests prove: a staff user cannot set `sms_consent`, insert a row already `opted_in`, or insert or update a phone row directly; a guest cannot write at all; a guest reads only their own household's rows; a phone value that is not E.164 is refused; changing a phone's value resets consent; a phone value never trips the staff-address refusal; a planner cannot change `sms_enabled` and a couple member can; deleting a household removes its contacts
- [x] T010 Database tests first in `supabase/tests/database/sms_messages.test.sql`, then migration `<timestamp>_sms_channel.sql` (data-model: Changed `campaigns`, Changed `messages`): create `campaign_channel` enum (`email`, `text`, `both`) and add `campaigns.channel` not null default `'email'`, included in the staff insert and update column grants and locked after the first send by the existing campaign guard; create `message_channel` enum (`email`, `text`) and add `messages.channel` not null default `'email'` and `messages.to_phone` text null; extend `messages_skip_reason_known` with `not_opted_in`, `declined`, `texting_unavailable`, `invalid_number`, `no_phone`; extend the household-delete trigger to null `to_phone`. Tests cover each constraint and that deleting a household nulls `to_phone`
- [x] T011 Database tests first in `supabase/tests/database/sms_functions.test.sql`, then migration `<timestamp>_sms_functions.sql` (data-model: New and changed database functions), all `security definer` with `set search_path = ''` and execute revoked from `public`: `get_my_contacts()` also returns each contact's `id` and, for phones, `consent`; `record_sms_consent(answers jsonb)` (guest) accepts `[{contact_id, opt_in}]`, applies only to phone contacts of the caller's household still `not_asked`, sets `opted_in` or `declined` with `sms_consent_at = now()` and source `first_sign_in`, returns the ids newly opted in, and ignores or refuses any other id without changing it; `find_phone_contact(value)` and `record_sms_consent_for_number(household_id, value)` (service role only; the latter sets `opted_in` from `not_asked` or `declined` with source `sign_in_prompt` and returns `{contact_id, newly_opted_in}`); `add_household_contact`, `update_household_contact`, `remove_household_contact` take a `kind` (default `email`), with the phone versions executable by the service role only; `import_one_household`/`import_households` accept a `phones` list per household (service-role path) and never a consent value; `claim_campaign_messages` becomes channel-aware (for a text row re-read the contact: removed → `skipped` `no_phone`, no longer `opted_in` → `skipped` `not_opted_in`, reminder opt-out applies; return channel and `to_phone`; a stale text claim is marked `failed` `unknown_outcome`, never re-queued); `record_text_status(provider_message_id, status, error_code, event_id, occurred_at)` applies the same ranking and duplicate rule as `record_message_event`, and on `failed` flags the contact. Tests prove each role's allowed and refused calls, that a guest cannot answer for another household or an email contact, that repeated answers are no-ops, claim behavior for each case, and status ordering and duplicates
- [ ] T012 Regenerate `src/types/database.ts` with `npm run db:types` if the local database can run (generated file; do not hand-edit). Otherwise skip and rely on the loosely typed client, noting it in the commit message

---

## Phase 3: User Story 8 - Without the text provider configured, the site works fully by email and admins are told (Priority: P1)

**Goal**: with no Twilio settings, nothing is texted, no text content shows to guests or staff, a banner warns staff, and email is unchanged.

**Independent test**: with no Twilio variables, run the unavailable test and the email-unchanged test; add the variables and the switch and see the text features appear.

- [x] T013 [P] [US8] Test first, then `src/components/admin/SmsBanner.tsx` and `AdminShell` support, tests in `src/components/admin/__tests__/sms-banner.test.tsx` and the existing `admin-shell.test.tsx`: the banner is a `role="status"` paragraph reading "Text messaging is not set up. Texts are off. Sign-in and invitations by email still work. See the setup instructions in docs/manual-setup.md."; `AdminShell` takes an optional `banner` prop and renders it above the page content in both the sidebar and phone layouts; without the prop nothing extra renders. Add the plain style to `src/app/(admin)/admin.css`
- [x] T014 [US8] Test first in `src/app/(admin)/admin/(console)/__tests__/layout.test.tsx` (add if missing, mirroring existing layout tests), then edit `src/app/(admin)/admin/(console)/layout.tsx`: it calls `getSmsState()` and passes the banner only when not configured; never on a guest page
- [x] T015 [P] [US8] Tests first, then change `src/app/(site)/page.tsx`, `src/components/site/Home.tsx` and `SignInPrompt.tsx` (Research: Hiding everything when texting is not available), tests in `src/components/site/__tests__/home.test.tsx` and `sign-in-prompt.test.tsx`: the page reads `getSmsState()` and passes `smsAvailable` down; with `smsAvailable` false the prompt shows exactly today's email-only wording (field label "Email address", text "Enter the email address we invited...", no phone wording, no checkbox) and the page text contains none of "text", "phone", "mobile", "SMS", "STOP"; the state is never read from `process.env` inside a client component
- [x] T016 [P] [US8] Tests first, then change the guest sign-in route `src/app/api/guest/sign-in/route.ts` to ignore the phone path when texting is not available (full change in US2; here only the gate), test in `src/app/api/guest/__tests__/sign-in.test.ts`: with texting unavailable a phone-looking value gets the neutral answer after the usual wait and the Twilio client is never called
- [x] T017 [P] [US8] Tests first, then the unavailable test `src/__tests__/sms-unavailable.test.tsx`: render every guest screen (`Home` signed out and signed in, `ConsentStep` is not rendered) and every admin console view that exists or is added by this feature, with no Twilio settings, and assert no text-related word appears (`text message`, `phone`, `mobile`, `SMS`, `STOP`, `HELP`, `opt`) outside the banner and the two legal pages; assert the legal pages still contain their text wording; assert the same screens do show the content with settings present and the switch on. Keep the list of screens in one array so a new screen is easy to add. The test fails until T013 to T016 and the later UI tasks hide their content
- [x] T018 [P] [US8] Test first, then `src/__tests__/email-unchanged.test.ts`: with no Twilio settings, the existing email sign-in (typed household address and staff address), personal-link route, invitation dispatch and magic-link template behave as in the current suite (reuse the existing route tests' fixtures); additionally a failure injected into the text side (a throwing Twilio client) never changes an email outcome
- [x] T019 [US8] Webhook gate: test first in `src/app/api/webhooks/twilio/__tests__/route.test.ts`, then create `src/app/api/webhooks/twilio/route.ts` with only the not-configured behavior now (200 and nothing recorded when not configured); the full route is built in US6

**Checkpoint**: the site is email-only and says so whenever Twilio is not configured.

---

## Phase 4: User Story 3 - Couple manages households' phone numbers (Priority: P1)

**Goal**: staff add, change and remove numbers (form and import), see opt-in state, and can never set it.

**Independent test**: create a household with one email and two numbers, edit and remove one, import a file with good, invalid, non-US, repeated and oddly formatted numbers.

- [x] T020 [P] [US3] Tests first, then phone parsing in the import: `src/lib/guests/__tests__/import.test.ts` and `src/lib/guests/import.ts`: columns `contact_phone`, `contact_phone_2`, `contact_phone_3`, ... are parsed with `parseUsPhone`; per-row, per-column errors "Not a valid phone number", "Only United States numbers are supported", "Repeated in this file"; formats normalise to E.164; a consent column is never read; when told texting is not configured the phone columns are dropped before validation and the result carries `phonesIgnored: <count>`
- [x] T021 [US3] Tests first, then `src/lib/guests/run-import.ts` and the import result view `src/components/admin/ImportResultView.tsx` / `ImportHelp.tsx`: pass the validated phones to `import_households` through the service-role path; report "Already used by another household" for a phone that exists; show "Phone numbers were ignored because texting is not set up" with the count when not configured; the import help lists the phone columns only when configured
- [x] T022 [P] [US3] Tests first, then phone actions in `src/lib/admin/actions/phones.ts` and routes `src/app/api/admin/households/[id]/phones/route.ts` and `.../phones/[contactId]/route.ts`, tests beside them: staff-only; validate with `parseUsPhone`; errors `invalid_phone`, `not_us_phone`, `phone_in_use`, `texting_not_configured` (nothing saved when not configured); call the service-role functions from T011; adding or changing resets opt-in; removing the last contact of either kind returns the paper-only warning flag
- [x] T023 [US3] Tests first, then the household form and views: `src/components/admin/forms/PhoneForms.tsx`, `HouseholdDetailView.tsx`, `HouseholdsListView.tsx`, `ContactsList.tsx` and `src/lib/admin/data/households.ts`: show phone count, each number's opt-in state ("Not asked", "Opted in", "Declined" with date) and "Paper only" when neither kind exists; a household whose only contact is a phone while texting is unavailable shows "Reachable by neither channel"; everything phone-related is hidden when not configured. Add these views to the list in the unavailable test (T017)

**Checkpoint**: numbers can be managed and no staff path can mark one opted in.

---

## Phase 5: User Story 1 - Guest opts in to texts when they first sign in (Priority: P1)

**Goal**: the consent step after first sign-in records opt-ins and sends one confirmation text per new opt-in.

**Independent test**: household with one email and one number; sign in by the emailed link, tick, see "opted in" and one confirmation text; repeat declining.

- [x] T024 [P] [US1] Tests first, then `src/lib/sms/consent.ts` and the guest schemas, tests in `src/lib/sms/__tests__/consent.test.ts` and `src/lib/guest-api/__tests__/schemas.test.ts`: `getConsentPrompt(session)` returns pending numbers (masked) only when texting is available; `answerConsent(session, answers)` validates `{ answers: [{ id, opt_in }] }` (1 to 10), calls `record_sms_consent` with the guest's own session, then sends one `sms_confirmation` text per newly opted-in contact through the service client and returns `{ saved }`; a send failure never undoes the recorded opt-in and is logged as a code
- [x] T025 [US1] Tests first, then `src/app/api/guest/sms-consent/route.ts` (contract [guest-api.md](./contracts/guest-api.md)), tests in `route.test.ts` beside it: `GET` returns `{ available, pending }`; `POST` returns `{ saved }`; `409 texting_unavailable`, `401`, `403 not_a_guest`, `422 invalid_payload`; another household's id changes nothing; staff sessions are refused
- [x] T026 [P] [US1] Tests first, then `src/lib/guest-api/mask.ts`, `schemas.ts`, `client.ts` and the RSVP route's `contacts`: add `maskPhone` use, the consent calls to the typed client, and phone entries in `contacts` only while texting is available
- [x] T027 [US1] Tests first, then `src/components/site/ConsentStep.tsx` and `Home.tsx` / `page.tsx`, tests in `src/components/site/__tests__/consent-step.test.tsx` and `home.test.tsx`: one unticked checkbox per pending number labelled "Text me at (•••) •••-0123", the consent statement once (text from [guest-api.md](./contracts/guest-api.md)) with links to `/privacy` and `/terms`, "Tick only numbers that are yours", a "Save my choice" button posting to the consent route and then reloading; unticked boxes are sent as `opt_in: false`; a signed-in guest with pending numbers sees the step instead of the placeholder, with none sees the placeholder, a staff session never sees it; add `ConsentStep` to the unavailable test (T017)
- [x] T028 [US1] Test first, then wire the "choice saved" state: after a successful save the page shows "Thanks, your choice is saved" with the confirmation sentence (matches `twilio/04-consent-step-saved.png`), and a failed save shows an error without losing the ticks

**Checkpoint**: a guest can opt in or decline at first sign-in.

---

## Phase 6: User Story 2 - Guest asks for a sign-in link by typing their phone number (Priority: P1)

**Goal**: one prompt for email or number; a ticked, known number gets an opt-in record, a confirmation if new, and a timed sign-in link by text; everything else gets the same neutral answer.

**Independent test**: with one household having an email and a number, ask for a link by each and sign in; ask for an unknown number and compare the answers.

- [x] T029 [P] [US2] Tests first, then `src/lib/auth/timed-link.ts` (Research: The sign-in link in a text must survive link previews), tests in `src/lib/auth/__tests__/timed-link.test.ts`: `timedToken(householdId, version, expiresAt)` and `parseTimedToken(token, version, now)` use HMAC-SHA256 over `householdId:version:expiry` keyed with `INVITE_LINK_SECRET`; valid for 15 minutes; reusable within the window; returns null for malformed, wrong signature, expired, or another link version; constant-time compare; never logs a token
- [x] T030 [US2] Tests first, then `src/app/t/[token]/route.ts`, tests in `route.test.ts`: valid token signs in through `createHouseholdSession` and redirects to the guest landing path; every failure is the same `302` to `/auth/error` with `Cache-Control: no-store` and `X-Robots-Tag: noindex`; works after the wedding day (no cutoff check); a reissued link or signed-out-everywhere household fails; with texting unavailable it still verifies normally
- [x] T031 [US2] Tests first, then change `src/lib/guest-api/schemas.ts` (`identifier` plus legacy `email`, optional `sms_consent`) and `src/app/api/guest/sign-in/route.ts` (contract [guest-api.md](./contracts/guest-api.md)), tests in `src/app/api/guest/__tests__/sign-in.test.ts`: a value with `@` follows the unchanged email path (all existing tests pass); a phone number with texting available and `sms_consent: true` applies the limiter keyed on the hash of the E.164 value before any lookup, finds the contact, records the opt-in for that number, sends a confirmation first only if newly opted in, then sends the timed-link text; every other case (unknown, non-US, no consent, over limit, unavailable, send failure) sends nothing and records nothing; the answer body, status and minimum 1.5 s are identical in all cases; logs hold an outcome code only; a thrown Twilio client changes nothing the guest sees; the new neutral message text from the contract
- [x] T032 [US2] Tests first, then change `src/components/site/SignInPrompt.tsx`: with texting available, one field "Email or mobile number"; the consent checkbox (unticked) and statement appear when the value looks like a phone number and `looksLikePhone` is true; the button for a phone number is disabled until ticked with a hint "Tick the box, or use your email address"; email needs no checkbox; sends `identifier` and `sms_consent`; the neutral message is shown for every answer except rate limiting and network failure
- [x] T033 [US2] Test first, then add the typed-number path to the timing test so unknown, known, non-US and unticked numbers all take at least the floor and answer identically (extend the existing timing test in `src/lib/__tests__/` for the sign-in route)

**Checkpoint**: typed phone sign-in works and reveals nothing.

---

## Phase 7: User Story 4 - Couple sends reminders and updates by email, text or both (Priority: P1)

**Goal**: campaigns carry a channel; texts go only to opted-in numbers, paced and resumable; the preview explains every skip.

**Independent test**: households with only emails, only phones, both, neither, and numbers in each consent state; send a reminder by "both".

- [x] T034 [P] [US4] Tests first, then `src/lib/campaigns/audience.ts` and `src/lib/admin/actions/campaigns.ts`: the campaign schema gains `channel` (`email` default, `text`, `both`); choosing `text` or `both` for a type with no registered text is refused with `template_missing` naming the type (invitation and save the date); not configured forces `email`
- [x] T035 [US4] Tests first, then `src/lib/campaigns/dispatch.ts` (data-model: Changed `messages`; research: Pacing): queue one `queued` text row per opted-in phone of each deliverable household and one `skipped` row for every other phone (`not_opted_in` or `declined`); with texting unavailable all text rows are `skipped` `texting_unavailable`; emails queue exactly as today and are unaffected by any text failure; claim by channel; `deliverText` sends through `sendText` with the status callback URL built from `NEXT_PUBLIC_SITE_URL`, records `sent` with the SID, or `failed` with the code and flags the contact on failure; the reminder opt-out applies to texts; idempotent per contact; tests use the fake client and a fake clock
- [x] T036 [US4] Tests first, then pacing and resume in `dispatch.ts`: texts are sent at most one every 2 seconds, each run stops at a 45-second time budget, remaining rows stay `queued`, the campaign stays `sending` until no row is queued or sending and only then becomes `done`; `dispatchDueCampaigns` already picks up `sending` campaigns, so a second run continues; a text claimed without a SID and older than 15 minutes becomes `failed` `unknown_outcome` and is never retried automatically while an email in the same state is; sign-in and confirmation texts are not queued behind campaigns (they call `sendText` directly)
- [x] T037 [P] [US4] Tests first, then the admin campaign screens: `src/components/admin/forms` (new-campaign form channel choice, shown only when configured, with "Texting is off" shown when configured but switched off), `AudiencePreviewView.tsx` and `src/lib/admin/data/campaigns.ts`: per household emails to send and texts to send, every skipped number or household with a plain reason (paper only, no contact on the chosen channel, not opted in, declined, reminders opted out, texting switched off, already responded), totals per channel, "Texting is switched off: texts will be skipped." when text is chosen and the switch is off; add to the unavailable test (T017)
- [ ] T038 [US4] Test first, then the scheduled run route `src/app/api/internal/dispatch-scheduled/route.ts`: unchanged secret check; reports per-campaign progress including remaining text rows; repeating a run changes nothing

**Checkpoint**: reminders go by email, text or both, only to opted-in numbers.

---

## Phase 8: User Story 6 - Couple switches texting on, sees it working, and tracks delivery (Priority: P2)

**Goal**: the on/off switch, Twilio's delivery notifications, and per-number delivery in the console.

**Independent test**: with the switch off, a "both" campaign sends only emails; turn it on, report a failure for one of two numbers, see only that number flagged.

- [x] T039 [US6] Tests first, then complete `src/app/api/webhooks/twilio/route.ts` (contract [twilio-webhook.md](./contracts/twilio-webhook.md); research: Delivery notifications), tests in `route.test.ts`: form-encoded body; signature checked with the library over the auth token, the URL built from `NEXT_PUBLIC_SITE_URL` + path and every posted parameter, a missing or wrong signature is `403 invalid_signature` and records nothing; statuses mapped with `statusForTwilio`; event key `<MessageSid>:<MessageStatus>`; duplicate and out-of-order events are safe; `failed`/`undelivered` flag the contact and household; unknown SID (sign-in and confirmation texts) is `200` ignored; save failure is `500`; no number or body in logs
- [x] T040 [P] [US6] Tests first, then the settings switch: `src/components/admin/SettingsView.tsx`, `src/lib/admin/actions/settings.ts`, `src/lib/admin/data/settings.ts`: a "Text messaging" card with an on/off control, visible only when configured, changeable only by the couple role, showing the state in words ("Texting is off. Guests are not asked to opt in and no texts are sent.") and that turning it on does not text anyone
- [ ] T041 [P] [US6] Tests first, then delivery views: `src/components/admin/DeliveryView.tsx`, `OverviewView.tsx`, `ReportsView.tsx` and their data functions: a per-number text column with latest status and `plainErrorReason`; failed texts counted with delivery problems; hidden when not configured; add to the unavailable test (T017)
- [ ] T042 [US6] Test first, then the flag clearing: correcting or removing a flagged number clears it (database test in `supabase/tests/database/sms_contacts.test.sql` plus a view test), and a number opted out by STOP shows "The recipient replied STOP" until corrected

**Checkpoint**: texting can be switched on and watched.

---

## Phase 9: User Story 5 - Wording comes from the repository (Priority: P2)

**Goal**: all texts come from `texts/`, refuse cleanly when missing, and fit one segment.

- [x] T043 [US5] Tests first: in `src/lib/sms/__tests__/texts.test.ts` a missing registry entry makes `renderText` throw `template_missing`; the sign-in route sends nothing and still gives the neutral answer; the dispatcher refuses the send before queuing; a throwing template marks the row `failed` `template_failed`; failures log the code only. Then make the two senders use `renderText` (T031, T035 already call it) and confirm no copy lives outside `texts/`
- [ ] T044 [US5] Review the five first-draft texts against the registered samples and the 160-character rule once more with the final link shapes (`/i/...` and `/t/...`); adjust wording only in `texts/`

---

## Phase 10: User Story 7 - Public privacy and terms pages (Priority: P2)

**Goal**: the two pages (already built on `main`) are reachable from the homepage and keep their text wording whatever the state.

- [x] T045 [US7] Tests first, then add two small plain links to `/privacy` and `/terms` on the homepage's sign-in prompt and placeholder (`src/components/site/SignInPrompt.tsx`, `Placeholder.tsx`, `site.css`): visible whether or not texting is available; the placeholder keeps its other content; update the existing tests that assert the placeholder's exact text content (`placeholder.test.tsx`, `no-data-leak.test.tsx`) deliberately and explain the change in the commit message
- [ ] T046 [P] [US7] Check `src/components/site/PrivacyPolicy.tsx` and `TermsAndConditions.tsx` against the final behavior (opt-in only, 30 days, STOP and HELP, carrier statement); change only if the build differs from the wording; the existing page tests stay green and the unavailable test (T017) already asserts the pages show text wording without Twilio

---

## Phase 11: Polish and cross-cutting

- [x] T047 [P] Write `docs/decisions/0014-text-messages.md`: Twilio and why; the configured and available states; recorded opt-in replacing "no consent tracking"; the 15-minute timed link and why not Supabase's single-use token; pacing and no automatic retry of unconfirmed texts; the narrow guest-facing exception (consent step, two pages, two links). Amend `docs/decisions/0013-placeholder-homepage.md` and `0011-household-sign-in-and-invite-links.md` with short pointers
- [x] T048 [P] Update `docs/guest-api.md` and `docs/admin-api.md` from the contracts (sign-in body and neutral message, `/t/[token]`, the two consent endpoints, masked phones, the channel choice, the phone routes, the switch, visibility rules)
- [x] T049 [P] Add a "Twilio" section to `docs/manual-setup.md` for someone doing it the first time, in order: eligibility (no tax ID), account and upgrade, a US local number, setting the four variables on Vercel (server-only, never in the repository) and redeploying, brand and campaign registration (use case, description, message flow, proof, privacy and terms links, sample texts, how to fix and resubmit), waiting for approval, Twilio's status callback URL, then turning the switch on. Add "texting is off and hidden until the variables are set" and the banner. Update `docs/architecture.md` and `README.md`
- [x] T050 [P] Update `CLAUDE.md`: layout rows for `texts/`, `src/lib/sms` and `src/app/t`; add `TWILIO_AUTH_TOKEN` to the secrets convention; keep the scope-exception wording. Run `/speckit-constitution` to add "Text: Twilio for delivery" to the technology line (minor version bump)
- [x] T051 Run `npm run format:check`, `npm run lint`, `npm run type-check`, `npm test`, `npm run build`, and `npm run test:db` if the database can run; fix anything this feature caused; do not reformat files it does not change
- [x] T052 Walk through [quickstart.md](./quickstart.md) sections 1 and 2 (automated checks and the unconfigured site) in a local build, and section 3 if Twilio test credentials are available; record what could not be run
- [x] T053 Commit in logical steps on the session branch and push; do not touch `main`

---

## Dependencies and order

- Phase 1 then Phase 2 first. In Phase 2, T003 to T007 are independent; T008 then T009 then T010 then T011 are in order (the enum value must exist before it is used).
- US8 (Phase 3) next, since the others must respect it. US3 (numbers) before US1 and US2 so opted-in data can exist; US1 and US2 are independent of each other; US4 needs US1 or US2 for opt-ins to test against; US6 needs US4's text rows; US5 and US7 can run beside US4 and US6.
- Within a story: tests, then data and library code, then routes, then views.

## Parallel examples

- Phase 2: T003, T004, T005, T006 and T007 together.
- US8: T013, T015, T016, T017 and T018 together once T004 is done.
- US4: T034 and T037 together; T035 then T036 in order.

## Implementation strategy

- **MVP** is Phases 1 to 3 plus US3, US1 and US2: email unchanged, numbers on file, guests can opt in and sign in by text, with everything hidden when unconfigured.
- Then US4 (campaigns), US6 (switch and delivery), then wording review, links and documents.
- The switch stays off until the carriers approve the registration; the build works end to end against Twilio's test credentials meanwhile.
