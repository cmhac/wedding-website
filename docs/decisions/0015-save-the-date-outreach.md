# 0015: The save the date outreach

Status: accepted (the couple's decisions of 2026-11-11). Extends
[0011](./0011-household-sign-in-and-invite-links.md) (a personal link can land
somewhere by the message it came in) and [0014](./0014-text-messages.md) (staff
may now record consent), and adds a third plain page to
[0013](./0013-placeholder-homepage.md)'s exception. The full design is in
[`specs/006-save-the-date-outreach`](../../specs/006-save-the-date-outreach/plan.md).

## Decisions

- **Staff can record text consent.** The text-message decision said only a
  guest's own ticked box could mark a number opted in. The couple now have guests
  who agreed to texts before the site existed, so the couple or the planner can
  mark a number as consented one at a time, in a batch from the household list,
  or through a consent column in the guest-list import. The record shows who
  marked it, when, how (the guest's tick, staff or import) and an optional note,
  and a staff mark that replaced a decline says so. One database function does
  the work all or nothing and only for staff; staff still cannot write the
  consent columns directly. Marking sends no text: the first message a number
  gets identifies the couple and carries the required disclosures.
- **Known conflict, left open on purpose.** The privacy and terms pages are
  locked (the couple's instruction) and say a number is texted only after the
  guest ticks a box on the site. Staff-marked consent contradicts that wording.
  The couple decide how to close the gap before the first text goes out: mark
  only guests who really opted in through a matching form, unlock the pages and
  add a sentence, or do not pre-mark anyone. The carrier registration's opt-in
  description should agree with the pages and with how consent was collected.
- **The message decides where a link lands.** A personal link in a save the date
  carries `?next=/save-the-date`, honored only from a fixed list. Nothing is
  stored on the household, so an old save the date email still lands on the save
  the date and the invitation lands on the RSVP.
- **A placeholder save the date page.** A barebones page at `/save-the-date`
  (the couple's narrow exception of 2026-11-11), using the placeholder
  homepage's stylesheet. The designer replaces it and reads the same endpoint.
- **One record of the card's facts.** The place and note live on the one
  settings row; the date is the wedding event's, read as a calendar date in the
  couple's time zone. The calendar file, both calendar links, the page and the
  preview are built from it. A calendar entry never holds a personal link.
- **The save the date text may take two segments**, and uses no link shortener.
- **Texting hours are a warning.** Outside 11 a.m. to 9 p.m. Eastern the console
  warns and does not block, as the text-message decision chose not to enforce
  hours.
- **A real save the date is held back by hard gaps** in a readiness list, and
  can be rehearsed to one household at a time, labelled as a test.
- **First opened** is recorded per household when a signed-in device loads a
  site page, for a "has not opened the site" follow-up. A mail scanner that loads
  the page could set it, so it is "opened or previewed".
