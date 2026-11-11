# Quickstart: validating the save the date outreach

Prerequisites: `npm ci`, a `.env.local` copied from `.env.example`, local Supabase running (`npm run db:start`, needs Docker) for the database tests and for the manual rehearsal.

## Automated

```bash
npm run format:check && npm run lint && npm run type-check && npm test
npm run test:db    # needs the local Supabase
npm run build
```

## Rehearsal (manual, against a deployment or `npm run dev`)

1. **Details.** In the admin console settings, choose the wedding event, set the place line and the note. The readiness list shows the date and details as ready.
2. **Consent.** Import the sample spreadsheet with a `phone_1_consent` column, or open a household and mark its number as consented. Check the household list shows the mark, who and when. Select two households and run the batch: review the summary, confirm, see the counts.
3. **Send a test.** On a save the date campaign (email and text, if the email template is registered and texting is on), choose "send a test" for your own household. Confirm one email and one text arrive, the text is two segments, and both links land on `/save-the-date`, signed in.
4. **Calendar.** On the page, add the date to Google Calendar, Outlook (web), and open the file in Apple Calendar and Outlook desktop. Confirm one all-day entry on the right date in each, with no personal link in it. Change the place line, re-download the file and open it again: note whether the entry is replaced or duplicated in each program.
5. **Landing.** Open an invitation test link; confirm it lands on the RSVP, not the save the date.
6. **Follow-up.** In the household list, confirm the test household shows as opened and a household you did not open shows as not opened; create a "has not opened the site" audience and check it contains the other household.
7. **Not ready.** Unregister nothing: temporarily point the site address setting at nothing in a preview and confirm the readiness list blocks the real send with a plain reason.

Expected outcomes are the spec's success criteria SC-001 to SC-009.
