# 0014: Text messages

Status: accepted (the couple chose Twilio on 2026-11-10 and the opt-in design on
2026-11-11). Replaces the "no consent tracking" decision made while planning the
personal invite links, and extends [0011](./0011-household-sign-in-and-invite-links.md)
(a typed phone number now gets a text link) and
[0013](./0013-placeholder-homepage.md) (the consent step and two legal pages).

A phone number is a second kind of household contact beside email, and texting
is as much a sign-in and messaging channel as email, with these decisions. The
full design is in [`specs/005-sms-support`](../../specs/005-sms-support/plan.md).

## Decisions

- **Twilio, through its official library, in one file.** Carriers require every
  automated text to be registered whichever provider sends it, so switching
  provider would not remove the checks. Only `src/lib/sms/twilio.ts` imports the
  package, so tests use a fake. Registration is a sole-proprietor brand and
  campaign (no business tax number).
- **Nobody is texted until they tick a box.** The save the date and the
  invitation can go by email, text or both, and a text goes only to an opted-in
  number. A guest opts in with an unticked checkbox, either in a
  one-time consent step after first sign-in or on the sign-in prompt when they
  type a number. The site records each number's opt-in (not asked, opted in,
  declined, with when and where) on the contact itself, so it goes when the
  number or household goes. Only two database functions can set it; staff cannot
  mark a number opted in by any route. The site keeps no opt-out list: the
  provider's STOP and START apply, and a refused text counts as a failed delivery.
- **Configured and available are different.** Configured means the Twilio
  settings are on the server (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and a
  messaging service or from number). Available means configured and the couple's
  switch (`settings.sms_enabled`) on. Without them every text feature is off and
  invisible, an admin banner says texting is not set up, and email is unchanged.
  The two public legal pages always keep their text wording, because the carrier
  registration needs it to be readable first.
- **United States numbers only, recognised in code.** `libphonenumber-js` tells
  US, Canadian and Caribbean numbers apart; numbers are stored as E.164. The
  database checks shape and uniqueness; staff writes to phones go through
  service-role functions after the code validates the number, and a last guard
  re-checks just before a text is sent.
- **The sign-in text carries a 15-minute link that is not single use**
  (`/t/<household>.<expiry>.<signature>`), because a messaging app may open a
  link before the guest does and use up a single-use token. It ends when a
  household's link is reissued or the household is signed out everywhere.
- **No idempotency for sending, so no automatic retry.** Twilio documents no
  idempotency key for creating a message. A text is claimed before sending and
  never re-sent automatically: one claimed but unconfirmed for 15 minutes is
  marked "not confirmed" for staff to check.
- **Paced for the registration's limit.** Campaign texts go one every 2 seconds
  (half of Twilio's one a second for this registration), up to 45 seconds a run;
  the scheduled run continues the rest. Sign-in and confirmation texts are sent
  at once.
- **Guest-facing exception.** Beyond the placeholder homepage: a consent
  checkbox on its sign-in prompt, the one-time consent step, two small links, and
  the public privacy and terms pages. Nothing else guest-facing is covered.

Why: guests are friends and family and email always works, so texting is
optional and must never surprise anyone; the carriers require a real opt-in and
a registered campaign; and a half-configured provider must never show guests a
feature that cannot work.

Alternatives: another provider or toll-free numbers (same checks); verbal consent
(did not meet the carriers' script requirements); Supabase's own phone sign-in
(a typed code, and it would make a second account system); a "Continue" screen
for single-use links (another guest-facing screen).

Consequences: a household with only a phone number cannot be contacted first by
the system (the preview flags it, and the couple send the link another way);
`TWILIO_AUTH_TOKEN` is a new server-only secret; the constitution's technology
line needs "Text: Twilio for delivery".

## Run time limit and error codes (checked 2026-11-11)

- **Run time.** Vercel's documentation (Limits and Fluid compute pages, read
  2026-11-11) gives a function a default and maximum of 300 seconds on the
  Hobby plan and a default of 300 seconds (maximum 800) on Pro. A run spends
  at most 45 seconds sending texts, so it fits with room to spare on either
  plan. The send and scheduled-run routes also set `maxDuration = 60`
  explicitly, so a future change in the platform default cannot cut a run
  short. The scheduled run reports each campaign's `remaining` count, and a
  campaign stays `sending` until nothing is queued.
- **Error codes.** Twilio's error dictionary matches the plain wording used in
  the admin console: 21610 (the recipient replied STOP), 30003 (handset
  unreachable), 30005 (unknown destination handset), 30006 (landline or
  unreachable carrier), 30007 (filtered as spam). Twilio's third-party
  explanations differ on how permanent 30005 is, so the console says the
  number "may not exist any more", not that it is gone.
- **Typed-number opt-in.** Anyone who knows a guest's number can tick the box
  on the sign-in prompt and opt that number in. The guest-list match still
  applies (only numbers already on a household are accepted), the opt-in
  records when and how it was given, and STOP always works. Chris has not
  yet decided whether that is acceptable for a small,
  known guest list; until he does, the behaviour is unchanged and a one-time
  code is the upgrade.
