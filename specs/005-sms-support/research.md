# Research: Text messages as a first-class way to sign in and be messaged

Decisions that settle the open questions in [plan.md](./plan.md). Each lists the choice, why, and what else was weighed. Checked 2026-11-11 against Twilio's documentation and by running the phone-number library; sources are linked where a fact matters. Wherever a fact could not be confirmed it is marked **verify while building**.

## R1: The provider library

- **Decision**: use Twilio's official Node package (`twilio`, server-side only) to send texts and to check the signature on Twilio's delivery notifications. The client is created in one file (`src/lib/sms/twilio.ts`) behind a small interface so tests pass a fake and nothing in the app imports the package directly.
- **Why**: Twilio says to use its libraries' signature check and not to write your own ([Twilio's webhook security guide](https://www.twilio.com/docs/usage/webhooks/webhooks-security)), and that check needs the exact URL and every parameter, which the library handles. The newest published version was 6.3.0 on 2026-11-11 (the constitution says to track the newest release).
- **Alternatives**: plain REST calls with `fetch` (no dependency, but signature checking would be hand-written, which Twilio advises against); a different provider (the couple chose Twilio on 2026-11-10; every provider faces the same carrier checks).

## R2: What "configured" and "available" mean in code

- **Decision**: three server environment variables decide **configured**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and a sender, either `TWILIO_MESSAGING_SERVICE_SID` (preferred, because the registered campaign is attached to a messaging service) or `TWILIO_FROM_NUMBER`. All must be present and non-empty. **Available** is configured **and** the couple's switch (`settings.sms_enabled`) on. One server helper, `getSmsState()`, returns `{ configured, enabled, available }` and is the only place that reads these.
- **Why**: it is the same pattern as the email key (set on the host, server-only, never public). Components never read the environment: server components and routes call the helper and pass booleans down as props, so nothing text-related is ever in the browser bundle's data and the hidden-UI rule is testable by rendering with a given state. A presence check is enough to decide visibility; a wrong credential shows up as failed sends, which are already tracked and flagged.
- **Alternatives**: a `NEXT_PUBLIC_` flag (leaks into every bundle and cannot be flipped without a rebuild); testing the credentials against Twilio on every page load (slow, and a Twilio outage would hide the feature); one combined switch with no separate switch (the couple chose to keep the switch).

## R3: Recognising United States numbers

- **Decision**: parse with `libphonenumber-js` using its full metadata (`libphonenumber-js/max`), accept a number only if it is valid **and** its country is `US`, and store it as E.164 (`+12025550123`). One module, `src/lib/sms/phone.ts`, is the only place that parses or formats numbers.
- **Evidence** (run 2026-11-11, version 1.13.16): the library tells United States, Canadian and Caribbean numbers apart by area code, which is the tricky case because they all start with +1. `(202) 555-0123` → US, valid, `+12025550123`; `(416) 555-0123` → CA; `(876) 555-0123` → JM; every common way of typing a US number (brackets, dashes, `+1`, leading `1`) gives the same E.164; `555-0100` and a too-short number are invalid.
- **Fixtures**: the library accepts `(202) 555-0123` as valid, so numbers in the reserved fictional range 555-0100 to 555-0199 work as test data.
- **Why E.164**: one canonical string means the unique rule across households and the sign-in limits work on exact matches.
- **Alternatives**: a regular expression for ten digits (cannot tell Canada from the US); a hand-kept list of area codes (maintenance burden); asking Twilio's Lookup service (costs money per call and sends numbers to a third party before consent).

## R4: Phone numbers are contacts, with one validation path

- **Decision**: add `phone` to the existing `contact_kind` type and store phone numbers in `household_contacts` beside emails, so uniqueness (`kind` + `value`), the delivery-problem flag, the household flag trigger, the audit trigger, deletion and row-level security all apply unchanged. The database checks the E.164 shape (`+1`, area code and exchange starting 2 to 9). The "United States only" rule is enforced in code by R3's module at every route this app provides (the admin forms, the import, the admin API), and again as a guard just before any text is sent. To keep a single validation path, direct staff writes to the table are limited to emails by row-level security, and the phone-writing functions are callable only with the service role from server routes after validation.
- **Why**: the database cannot tell Canada from the US without a hand-kept area-code list (R3), and the staff are the couple and the planner, so this is a product rule rather than a security boundary. The send-time guard means a bad number that slipped in is skipped with a plain reason, never texted.
- **Alternatives**: a separate phone table (duplicates every rule); a database area-code list (maintenance); trusting staff input (no guard at send time).

## R5: The opt-in record lives on the contact

- **Decision**: three columns on `household_contacts`: `sms_consent` (`not_asked`, `opted_in`, `declined`), `sms_consent_at` and `sms_consent_source` (`first_sign_in` or `sign_in_prompt`). A trigger resets all three to `not_asked` when the value changes, exactly as the delivery problem resets. A check makes them meaningful only on phone rows. Only two security-definer functions can set them (R6); staff and guests cannot update these columns directly.
- **Why**: the opt-in belongs to the number, disappears with it (including when a household is deleted), and is covered by the existing row-level security and change history (column names only, never values).
- **How staff are kept out of the columns**: Postgres cannot take a column back from a table-wide grant, so the table-wide update grant for `authenticated` is replaced by a column grant for `value` only (the delivery flag is set by security-definer triggers). A database test proves a staff user cannot set `sms_consent` or insert a row already opted in.
- **Alternatives**: a separate consent table (a join in every send, an orphan when a number changes); storing consent as a household flag (wrong: it is per number).

## R6: How an opt-in is recorded

- **Decision**: two functions. `record_sms_consent(answers)` is for the consent step: a guest's own session passes `[{ contact_id, opt_in }]`; each id must be a phone contact of the caller's household still `not_asked`; it returns the ids that became opted in. `record_sms_consent_for_number(household_id, value)` is for the sign-in prompt: service role only, called after the server has looked the number up; it sets `opted_in` (from `not_asked` or `declined`) and says whether that is new. The server sends the confirmation text only for newly opted-in contacts, so repeated ticks never send a second one.
- **Why**: the checks live next to the data, the guest never names a household, and a number the household does not own cannot be changed.

## R7: One sign-in field, and how a typed value is classified

- **Decision**: `POST /api/guest/sign-in` accepts `{ "identifier": "...", "sms_consent": true? }`; the old `{ "email": "..." }` still works as an alias so nothing breaks. A value containing `@` is the existing email path, untouched. Anything else is tried as a phone number (R3). The prompt shows the consent checkbox as soon as the typed value looks like a phone number, and sends `sms_consent: true` only if it is ticked. Without texting available, the prompt shows email-only wording and the server treats a typed phone number as unknown. Every outcome gets the one neutral answer after the same minimum wait (the existing 1.5 seconds), whether or not anything was sent.
- **Limits**: the existing per-IP limiter and the database limiter apply, keyed by the same keyed hash (`addressHash`, which already lower-cases and trims) applied to the E.164 string, so no number is stored. The phone path checks the limiter first, before any lookup, so an unknown number costs no more than a known one.
- **Why not reveal**: a number that is not on a household, not opted in with the box ticked, outside the US, over a limit, or typed while texting is off all return the identical answer; only a known, ticked number triggers a text.

## R8: The sign-in link in a text must survive link previews

- **Decision**: the text carries a **timed link**, not Supabase's single-use token: `/t/<household id>.<expiry>.<signature>`, where the expiry is seconds in base 36 (6 characters) and the signature is the first 128 bits (22 characters) of an HMAC over a message no other link signs, the household id, the household's current link version and the expiry, keyed with the existing `INVITE_LINK_SECRET`. The signature is truncated on purpose so a sign-in text fits one segment. It is valid for 15 minutes, works any number of times in that window, is checked and turned into a session by the same code as the personal link, and does not depend on the wedding-day cutoff (typed sign-in keeps working after the wedding, as for email). Reissuing a household's link or "sign out everywhere" still ends it, because the link version is part of the signature. The fixed window is a constant in code; no new database state.
- **Why**: messaging apps and phone features may fetch a link before the guest taps it, which would use up a single-use token. This failure is widely reported for emailed one-time links ([Auth0 community on link previews and scanners](https://community.auth0.com/t/link-protect-software-breaks-passwordless-auth/60395), [Ghost forum on iOS](https://forum.ghost.org/t/advice-for-ios-user-having-trouble-with-magic-link/22635)); I found no source that documents what the leading messaging apps do, so the design assumes the worst. The usual alternative, a "Continue" screen that must be tapped, would be another guest-facing screen, which the scope rule does not allow. A reusable-for-15-minutes link needs no screen and is no weaker than the personal link, which already works on any device until the wedding.
- **Cost**: a forwarded sign-in text works for anyone for up to 15 minutes. The invitation's personal link is already forwardable for months, so this adds little.
- **Alternatives**: Supabase's single-use token in the text (breaks if previewed); the household's personal link in the text (works, but stops on the wedding day and the spec says typed sign-in keeps working); a longer window (more exposure).

## R9: Sending a text, and never sending twice

- **Decision**: `src/lib/sms/send.ts` creates the message through the Twilio client with the messaging service (or from number), the recipient, the body and a status callback URL, and returns an outcome code only (never Twilio's error text, which can echo the number). Campaign texts use the existing claim pattern: a row is claimed (`sending`) before the call and updated with Twilio's message SID after. **I found no idempotency header documented for Twilio's Messages API** (a search of Twilio's documentation turned up idempotency only on other products), so unlike email there is no key to make a retry safe. Therefore a claimed text row that has no SID after a crash is **never retried automatically**: after 15 minutes it is marked `failed` with the code `unknown_outcome` and shown to staff, who can see whether Twilio has the message and re-send by hand. Emails keep today's automatic retry.
- **Why**: a duplicate text to a guest is worse than a missing one the couple can see and fix. **Verify while building** that Twilio still documents no idempotency for message creation.
- **A refused send**: when Twilio refuses because the person replied STOP (error 21610, described in [Twilio's opt-out article](https://support.twilio.com/hc/en-us/articles/223134027-Twilio-Support-for-Opt-out-Keywords-SMS-STOP-Filtering)), the row becomes `failed` with `opted_out` and the number is flagged. Other refusals use the error code.

## R10: Delivery notifications

- **Decision**: `POST /api/webhooks/twilio`, form-encoded, checked with the library's `validateRequest` using the auth token, the `X-Twilio-Signature` header, the public URL built from `NEXT_PUBLIC_SITE_URL` plus the path (not the request's own URL, which differs behind Vercel's proxy, a known cause of false failures per [Twilio's proxy help article](https://help.twilio.com/articles/50535649249307)) and every posted parameter. Twilio reports `queued`, `sending`, `sent`, `delivered`, `undelivered` and `failed`, with an `ErrorCode` on the last two ([Twilio's status guide](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks)). Mapping to the existing statuses: `queued` and `sending` → `sending`; `sent` → `sent`; `delivered` → `delivered`; `undelivered` and `failed` → `failed` with the error code and the contact flagged. A new function `record_text_status` applies the same "never move backwards" ranking as email. Twilio sends no event id, so the event key is the message SID plus the status, which makes a redelivery a no-op. The route answers 200 with nothing when the provider is not configured, and refuses a bad signature with 403.
- **Why**: it mirrors the Resend webhook so the two behave the same for staff, and the existing delivery views work unchanged.
- **Error words** (shown to staff in plain English): 21610 recipient replied STOP; 30003 phone unreachable; 30005 unknown number; 30006 landline or unreachable carrier; 30007 blocked by the carrier. **Verify while building** against [Twilio's error dictionary](https://www.twilio.com/docs/api/errors); unknown codes show "Twilio error NNNNN".

## R11: Pacing

- **Decision**: a sole proprietor registration allows one message per second ([Twilio's throughput article](https://support.twilio.com/hc/en-us/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US)) and Twilio queues anything faster, which would delay a guest's sign-in text behind a bulk send. So campaign texts go out at most one every 2 seconds, leaving half the capacity for sign-in and confirmation texts, which are sent immediately and never queued behind a campaign. Each run of the sender processes texts until a time budget (45 seconds) is spent and leaves the rest queued; the campaign stays `sending` until no message is left queued or sending, and the existing five-minute scheduled run (which already picks up campaigns left `sending`) continues it. "Send now" does the same first pass and the schedule finishes the rest. For about 100 numbers and a dozen messages each over six months, a reminder to everyone takes about 200 seconds, so one send spans several runs and finishes within about 15 minutes.
- **Why**: it respects the registration's limit without a queue service, and it reuses today's resume-after-crash behavior. The roughly 1,000 a day T-Mobile cap reported by third parties is not reached by one reminder of about 100. **Verify while building** the host's maximum run time (hosting decision) and set the budget below it.

## R12: Text wording is registered like email templates

- **Decision**: a new top-level `texts/` folder mirrors `emails/`: an `index.ts` registry plus one module per text, each a function from props to a string. Keys: `sms_sign_in`, `sms_confirmation`, `rsvp_reminder`, `update`, `optional_events_reminder`. Campaign types look their text up by the same `template_key` as email; **`invitation` and `save_the_date` have no text**, so choosing text for them is refused by the existing "no registered wording" check. Texts are plain strings, and a test requires every text, rendered with realistic props (a 40-character site URL, a household link), to be **at most 160 characters of the standard GSM-7 alphabet** so it fits in one text segment (no emoji, no curly quotes). The first-draft wording stays consistent with the sample texts registered with Twilio, because carriers compare what is sent with what was registered.
- **Why**: the email system's registry, refusal and test patterns carry over, and Chris can polish the wording in one folder.
- **Alternatives**: wording in the database (not versioned or tested); inside `src/lib/sms` (mixes copy with logic). A new top-level folder needs a row in the layout table of `CLAUDE.md`.

## R13: Hiding everything when texting is not available

- **Decision**: a state object from `getSmsState()` is read once per request in the two places that render pages (the site page, the admin console layout) and passed down as props. The guest side shows text content only when `available`; the admin side shows the banner when not `configured`, the text controls when `configured`, and the on/off state when configured but off. A test renders every guest screen and every admin screen with no Twilio settings and fails if any text-related word appears outside the banner and the two legal pages; the same test with settings present and the switch on proves the content comes back. Server routes check the state first and treat a text feature as absent (the consent routes answer `409 texting_unavailable`, the webhook answers 200 and ignores).
- **Why**: one source of truth, one failing test that guards every future screen, and no feature flags scattered in components.
- **Edge**: while not configured, existing numbers and opt-ins stay in the database untouched; imports ignore phone columns and say so (R16).

## R14: Where the banner goes

- **Decision**: `AdminShell` accepts an optional `banner` and renders it above the page header on every console page (sidebar and phone layouts); the console layout supplies it from `getSmsState()`. It is a plain `role="status"` paragraph styled in the one admin stylesheet. When configured but switched off, no banner appears, and the Settings and Campaigns screens say "Texting is off" where the switch and channel choice are.
- **Why**: the shell is already shared by every console page, so there is nothing to forget on a new page.

## R15: The first-sign-in consent step

- **Decision**: the home page, server-rendered, asks `getConsentPrompt()` for a signed-in guest's numbers that are `not_asked` (only when texting is available). If there are any, it renders `ConsentStep` (a small client form) instead of the placeholder line; otherwise the placeholder as today. The form posts to `POST /api/guest/sms-consent` and then reloads the page. The same endpoints serve the designer's later frontend. "Any signed-in member can answer for any number" is the spec's rule; the screen says to tick only numbers that are yours.
- **Why**: the homepage is the only guest-facing page the repository owns, the form reuses the guest API so the designer can rebuild it, and the choice is recorded by the same function either way.
- **Staff**: the placeholder shown to staff is unchanged; staff are never asked.

## R16: Import with phone columns

- **Decision**: the spreadsheet adds `contact_phone`, `contact_phone_2`, `contact_phone_3` and so on, parsed by R3's module with the same per-row, per-column error reporting as emails ("Not a valid US phone number", "Only United States numbers are supported", "Repeated in this file"). The database function adds phone rows with the consent state `not_asked` and does not accept a consent value. When texting is not **configured**, the importer drops phone columns before validating, saves nothing from them, and reports "Phone numbers were ignored because texting is not set up", plus the count. When configured, they are saved even if the switch is off.
- **Why**: nothing is half-saved while the feature is hidden, and the couple can re-import later.

## R17: Decisions and documents to update

- New decision record for the text feature (provider, the available state, recorded opt-in replacing "no consent tracking", the 15-minute timed link, the pacing, the narrow guest-facing exception). Amend the placeholder homepage decision for the consent step and legal pages, and note in the household sign-in decision that a typed phone number now gets a text link.
- `CLAUDE.md`: layout rows for `texts/` and `src/lib/sms`, the new secrets, and keep the scope exception wording on the session branch merged. Constitution: amend the technology line "Email: Resend" to add "Text: Twilio for delivery" (a minor version, through the constitution command).
- `docs/guest-api.md`, `docs/admin-api.md`, `docs/manual-setup.md` (Twilio section for a first-timer), `docs/architecture.md`, `.env.example`.

## R18: Testing without sending real texts

- **Decision**: unit tests inject a fake client; nothing in the test suite touches the network. A short manual check with Twilio's test credentials is in the quickstart: Twilio documents a magic sender `+15005550006` that passes validation and returns a fake message SID without delivering anything, and magic recipients that return specific errors ([Twilio's test credentials guide](https://www.twilio.com/docs/iam/test-credentials)). Database behavior (column grants, consent functions, claiming) is covered by database tests that run against the local Supabase.
- **Why**: fast, deterministic tests, and a real end-to-end check that costs nothing and texts nobody.
