# Quickstart: validating text messages

Run these in order. None of them texts a real person: the automated tests use a fake client, and the manual check uses Twilio's test credentials, which return a fake message SID and deliver nothing ([Twilio's test credentials guide](https://www.twilio.com/docs/iam/test-credentials)). Contracts: [guest API](./contracts/guest-api.md), [admin API](./contracts/admin-api.md), [Twilio notifications](./contracts/twilio-webhook.md), [text wording](./contracts/text-templates.md). Data: [data-model.md](./data-model.md).

## 1. Automated checks

```bash
npm run format:check && npm run lint && npm run type-check && npm test
npm run db:start && npm run test:db
```

Expected: all pass. The tests that matter most:

- The **unavailable test** renders every guest and admin screen with no Twilio settings and finds no text-related word outside the admin banner and the two legal pages; with settings present and the switch on, the same screens show them.
- The **never-text-without-opt-in test** drives every route that can send a text (sign-in, consent, campaigns, the scheduled run) with numbers in each consent state and asserts only opted-in numbers are texted.
- The **email-unchanged test** runs the earlier email sign-in and invitation journeys with no Twilio settings and compares the outcome with today's.
- The database tests prove a staff user cannot set `sms_consent` and that guests can answer only for their own household's numbers.

## 2. With Twilio not configured (the default)

Start the site with no `TWILIO_*` variables (`npm run dev`).

1. Open `/` signed out: the prompt asks for an email address only; typing a phone number gets the usual neutral answer and nothing else happens.
2. Sign in to `/admin`: every page shows "Text messaging is not set up..."; Households, Import, Campaigns and Settings show no phone or text content.
3. Import a file with a `contact_phone` column: the result says phone numbers were ignored.
4. Send an invitation to a household with an email: it arrives as before.
5. Open `/privacy` and `/terms`: they still describe texts.

## 3. With Twilio's test credentials

Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` to your account's **test** credentials and `TWILIO_FROM_NUMBER=+15005550006` (Twilio's magic sender; no messaging service is needed for the test). Restart.

1. The admin banner disappears. Settings shows "Text messaging" as off.
2. Add household phone `(202) 555-0123`: it appears as "not asked". Adding `(416) 555-0123` is refused (not a United States number).
3. Turn the switch on. Sign in to the household with its emailed link: the consent step appears with a masked number and an unticked box. Tick and save: the number shows "opted in" and Twilio's response (a fake SID, status `queued`) is logged as a code with no number.
4. On a signed-out browser type `(202) 555-0123`, tick the box, ask for a link: the answer is the neutral one. The timed link is the text sent; open `/t/...` (copied from the test run's output) within 15 minutes to sign in.
5. Create a reminder campaign by "both": the preview counts emails and texts, and lists unopted numbers as skipped "not opted in". Send it.
6. Post a signed `failed` notification to `/api/webhooks/twilio` (the test helper in `src/lib/sms/__tests__/` builds a valid signature): the number is flagged and the delivery view shows the reason. A bad signature is refused with 403.

## 4. Real registration (when the carriers approve)

Follow the Twilio section of `docs/manual-setup.md`: set the real variables on the host, redeploy (the banner disappears), then turn the switch on in Settings. Guests see the consent step at their next sign-in; nothing is texted until they tick.
