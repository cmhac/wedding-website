# Research: Save the date outreach

Decisions made while planning, each with its reason and the alternatives set aside. Outside facts were checked on 2026-11-11; where only community sources exist, that is said.

## R1. The message decides where a link lands

**Decision**: the personal link in a save the date message is `/i/<token>?next=/save-the-date`. The existing personal-link route already honors a `next` value; `allowedNext` (the fixed-list guard) gains the save the date path alongside the guest landing path. A message type maps to its destination in one file (`src/lib/auth/destination.ts`): `save_the_date` maps to `/save-the-date`; every other type has none and links stay as they are.

**Rationale**: nothing is stored on the household, the same link keeps working for every later message, an old save the date email still lands on the save the date, and the invitation lands on the RSVP. The `next` guard already refuses anything not on a short fixed list, so this adds no open redirect.

**Alternatives**: a site-wide "phase" setting that decides the landing (rejected: an old email would land somewhere different from the one it was sent for, and it is one more setting to forget); storing a destination on the household (rejected: the spec forbids it, and one household gets several messages).

**Cost**: the link grows by 20 characters, which matters only for the text (see R6).

## R2. The placeholder page

**Decision**: a server-rendered page at `/save-the-date` in the `(site)` group, using `site.css` only. It reads the signed-in session; a visitor who is not signed in is redirected to `/`. It reuses the existing consent step below the date when the household has unanswered numbers, and records that the household has opened the site.

**Rationale**: the couple's narrow exception allows exactly this. Reusing the group's layout keeps the theme script and stylesheet, and the designer can replace the one page component.

**Alternatives**: a client component fetching the JSON endpoint (rejected: slower first paint, more moving parts for a placeholder).

## R3. Where the card's facts live

**Decision**: `settings` gains `save_the_date_place`, `save_the_date_note` and `save_the_date_revision`. The date is the wedding event's date (already chosen in settings as `wedding_event_id`), taken in the venue's time zone (`America/Los_Angeles`, as the invite-link cut-off already does) so it is a calendar date, not a moment. A trigger bumps the revision when the place, note or wedding event changes. Guests cannot read `settings`, so a security-definer function `get_save_the_date()` returns the shaped details to any signed-in guest or staff member.

**Rationale**: one record, no second copy of the date or the couple's names, and a revision number that doubles as the calendar file's `SEQUENCE`.

**Alternatives**: a new table (rejected: one row, and `settings` is already that); typing the date again (rejected by the spec).

## R4. The calendar entry

**Decision**: a pure module builds (a) an `.ics` file, (b) a Google Calendar link and (c) an Outlook web link, all from the same details.

- All-day: `DTSTART;VALUE=DATE:YYYYMMDD` and `DTEND;VALUE=DATE:` the next day, because the end of a date range is exclusive in RFC 5545 ([RFC 5545](https://rfc-editor.org/rfc/rfc5545)). Google's link takes `dates=YYYYMMDD/YYYYMMDD` with the end one day later ([Interaction Design Foundation notes](https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html), community-documented).
- Outlook web: `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=...&startdt=YYYY-MM-DD&enddt=YYYY-MM-DD&allday=true` (community-documented; the address has changed before, so the module keeps it in one constant and the quickstart tests it by hand) ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/860833/outlook-changing-special-characters-to-html-encode)). Work and school accounts use a different host; the page offers the file as the fallback for them.
- Stable identity: `UID:save-the-date@<site domain>` with `SEQUENCE` set to the details revision and `LAST-MODIFIED` set, so programs that match on the identity replace the entry. Whether Apple Calendar and Outlook honour that on re-import was not found documented, so the quickstart checks it in real programs and the spec says only "programs that honour it".
- Also emitted: `X-MICROSOFT-CDO-ALLDAYEVENT:TRUE` (Outlook), CRLF line endings, line folding at 75 octets and text escaping.
- Contents are only the title, the date, the place line, the note and the site's address. No personal link, no household.

**Alternatives**: a calendar library such as `ics` (rejected: one fixed event, and a dependency to track); a subscribable `webcal://` feed (rejected: cookie-less feeds would expose the details publicly, and Google subscriptions refresh slowly).

## R5. Staff-marked consent

**Decision**: one security-definer function `staff_set_sms_consent(household_ids, contact_id, mode, override_declined, note, dry_run)`, callable by `authenticated` and checking `is_staff()` (the couple and the planner are the only staff roles). It marks (`opted_in`, source `staff`), clears (`not_asked`), or only counts (dry run), in one statement so a batch is all or nothing, and returns the counts the spec asks for. A second service-role function records the import's marks. The table's column grants are unchanged, so staff still cannot write the consent columns directly. New columns hold who marked it, an optional note, and whether it overrode an earlier decline. The two check constraints that list the known sources, and the "complete or empty" constraint, are widened; the existing reset-on-value-change trigger also clears the new columns.

**Rationale**: the all-or-nothing and staff-only guarantees live where the data lives, and the existing rule is relaxed in one auditable place. No confirmation text is sent when a mark is made (spec FR-018): the first message does the work.

**Alternatives**: loosening the column grants so staff update rows directly (rejected: it lets any staff write path set consent without the record of who and why); doing the batch in application code (rejected: not atomic).

## R6. The save the date text

**Decision**: `texts/save-the-date.ts` reads "Hi, it's Chris & Hannah! Time to save the date: {link} Msg&data rates may apply. Reply HELP for help, STOP to opt out" (first draft, in the couple's words). With a 30-character site address and the 20-character `next`, the link is about 119 characters, so the text is two segments. Segment count is computed (GSM-7: 160 for one, 153 for each of a joined set) and shown in the preview. The shared "one segment, 160 characters" rule is kept for every other text; the registry test names the save the date as the one two-segment exception. No link shortener: Twilio says shared public shorteners should not be sent ([Twilio support](https://support.twilio.com/hc/en-us/articles/1260804572090)).

**Alternatives**: shortening the link with a `next` alias such as `/s/<token>` (rejected: a second route and token format just to save a segment of cost; the text is sent once per number).

## R7. Quiet-hours warning

**Decision**: a pure function `textSendWarning(when)` returns a warning when the send time (or "now") is outside 11:00 to 21:00 Eastern, which keeps every continental time zone inside 8 a.m. to 9 p.m. It warns and never blocks. The federal rule's reach over texts sent with prior consent is undecided ([National Law Review](https://natlawreview.com/article/clocked-fcc-seeks-clarity-call-time-rules)), and the text-message spec decided not to enforce hours.

## R8. Test sends

**Decision**: `campaigns.is_test boolean`. A test is an ordinary campaign with a single-household audience, sent through the same dispatcher, and the not-yet-sent audience filter ignores test campaigns. The delivery view labels them. The console offers "send a test" with a household picker; several households means several tests.

**Alternatives**: a dry-run renderer that sends nothing (rejected: the couple want to see it arrive in their own inbox and phone, and that only a real send proves).

## R9. Readiness list

**Decision**: a server function `loadReadiness()` computes the list from live settings and the registries (details complete, wedding date set, email template registered, text registered and within its length rule, site address set, RSVP state, texting state, sending domain verified when a key is present, reach counts). Hard gaps (no email template when email is chosen, no date, no site address) block the real send in the send action; soft gaps warn.

**Rationale**: it reuses the same registries the dispatcher checks, so the list cannot disagree with the send.

## R10. First opened

**Decision**: `households.first_opened_at`, set once by a guest-callable function `record_household_opened()` that the placeholder pages call when a signed-in guest loads them. The audience filter `not_opened` selects households where it is null. A mail scanner that follows the personal link and loads the page with its own cookie jar would still set it, which the spec allows ("opened or previewed"): the column is described that way in the console.

**Alternatives**: recording in the personal-link route (rejected: that is exactly the request a scanner makes, with no page load behind it).

## R11. Batch editing

**Decision**: the household list gains a checkbox per row, a "select every household matching this filter" option, and an action bar. Choosing an action posts to a server action that first returns a dry-run summary and then, on confirm, applies it through R5's function. The first actions are "mark phone numbers as consented" and "clear consent mark". Built as a small general component so later actions can use it; only the consent actions ship.

**Alternatives**: a modal with client-side selection (rejected: the console is plain server-rendered forms by design).

## R12. Import consent column

**Decision**: each phone column may be followed by a "texting consent" column (headers `contact_phone_consent`, `contact_phone_2_consent` and so on, matching the phone columns `contact_phone`, `contact_phone_2`): yes, no or blank. A yes records consent "by import" through the service-role function, only from "not asked" unless the staff member ticks an override; an unrecognised value is a per-row, per-column error that skips the household, as other bad rows do.
