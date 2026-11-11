# Implementation Plan: Text messages as a first-class way to sign in and be messaged

**Branch**: `005-sms-support` (work happens on the session branch) | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-sms-support/spec.md`

## Summary

Add text messages beside email. A phone number becomes a second kind of household contact, with its own opt-in record: nobody is texted until they tick an unticked box, either in a one-time consent step after their first sign-in or on the sign-in prompt when they type a number. The save the date and the invitation can be sent by email, text or both. A guest can sign in by typing a phone number (a timed, link-preview-safe link is texted), campaigns can go by email, text or both (texts only to opted-in numbers, paced to Twilio's limit), and delivery is tracked per number from Twilio's notifications. Everything text-related is off and invisible unless Twilio's settings are on the server and the couple's switch is on; without them an admin banner says texting is not set up and email works exactly as before. The registration's two public pages already exist; they keep their text wording regardless.

## Technical Context

**Language/Version**: TypeScript (strict) on the Node version in `.nvmrc`, Next.js App Router, React.

**Primary Dependencies**: existing plus two, server-side only: `twilio` (send and signature check) and `libphonenumber-js` (United States number recognition, using its full metadata). Both track their newest release (constitution), recorded in the decision record.

**Storage**: Postgres (Supabase): new migrations extend `household_contacts` (phone kind, opt-in columns), `settings`, `campaigns` and `messages`; no new table. See [data-model.md](./data-model.md).

**Testing**: Jest and React Testing Library (route handlers in the node environment, components in jsdom, a fake text client everywhere), pgTAP database tests for the new grants and functions. No test touches the network.

**Target Platform**: Vercel production (`hannahandchris.wedding`) and preview deployments; Supabase.

**Project Type**: web application (single Next.js app).

**Performance Goals**: a guest's sign-in text is sent within the existing 1.5 s sign-in response floor (the send does not extend it); campaign texts go out one every 2 seconds.

**Constraints**: nothing text-related visible or reachable unless texting is available; no number or message body in logs; Twilio's sole-proprietor limit of one message per second and one campaign; no second guest-facing screen beyond the consent step and the two legal pages; the same neutral sign-in answer and timing for every typed value.

**Scale/Scope**: about 100 households, about 100 numbers, a dozen texts per number over six months.

## Constitution Check

_GATE: must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                               | Status                 | Notes                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Test-first                           | Pass                   | Every task writes the failing test first: phone parsing, availability state, the opt-in functions and grants (database tests), sign-in classification and neutrality, the timed link, consent endpoints, dispatcher queueing and pacing, the Twilio notification route, the hidden-UI test, the email-unchanged test.                            |
| II. Schema by migration, RLS everywhere | Pass                   | All changes are migrations; no new table; column-level grants keep staff out of the consent columns; database tests prove what each role can and cannot do.                                                                                                                                                                                      |
| III. Secrets and guest data protected   | Pass                   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and the sender are server-only, never `NEXT_PUBLIC_`, listed by name only in `.env.example`. Numbers and message bodies are never logged; sign-in limits store a keyed hash; fixtures use 555-0100 to 555-0199. Opt-in records are personal data and go when the household does.                      |
| IV. One repository                      | Pass                   | Text wording lives in a new `texts/` folder beside `emails/`; setup steps that cannot be code go in `docs/manual-setup.md`.                                                                                                                                                                                                                      |
| V. Current tooling, recorded decisions  | Pass, with a follow-up | Two new dependencies at their newest versions. The constitution's stack line "Email: Resend" needs a companion "Text: Twilio for delivery": a minor amendment through the constitution command, done in this feature's documentation task. A new decision record covers the provider, the availability rule, recorded opt-in and the timed link. |
| Quality gates                           | Pass                   | `format:check`, `lint`, `type-check`, `test`, `test:db`, and `npm run build` (new routes).                                                                                                                                                                                                                                                       |

No violations, so the complexity table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-sms-support/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── guest-api.md
│   ├── admin-api.md
│   ├── twilio-webhook.md
│   └── text-templates.md
├── checklists/requirements.md
└── tasks.md          # created later by /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/                       # NEW (4): phone contact kind; contacts, consent, settings, grants;
│                                     #   campaigns and messages (channel, skip reasons); functions (consent,
│                                     #   claim, text status, contact and import changes)
└── tests/                            # NEW pgTAP: grants, consent functions, claim, text status
texts/                                # NEW: text wording registry, mirrors emails/
├── index.ts
└── *.ts                              # sign-in, confirmation, reminder, update, optional events reminder
src/
├── lib/
│   ├── sms/                          # NEW (server-only)
│   │   ├── state.ts                  # getSmsState(): configured, enabled, available
│   │   ├── twilio.ts                 # the one file that imports the Twilio library; fake-able client
│   │   ├── phone.ts                  # parse, US check, E.164, mask
│   │   ├── send.ts                   # send one text, outcome codes only
│   │   ├── consent.ts                # server side of both opt-in routes
│   │   ├── status.ts                 # Twilio status to our status, error code to plain words
│   │   └── __tests__/
│   ├── auth/timed-link.ts            # NEW: the 15-minute signed link; reuses the household session code
│   ├── campaigns/dispatch.ts         # CHANGED: channels, per-number queueing, pacing and resume
│   ├── campaigns/audience.ts         # CHANGED: channel in the schema
│   ├── guests/import.ts              # CHANGED: phone columns, ignored when unconfigured
│   ├── guest-api/{schemas,mask,client}.ts  # CHANGED: identifier, consent calls, masked phones
│   ├── admin/…                       # CHANGED: phone forms and actions, preview and delivery data, settings switch
│   └── email/templates.ts            # CHANGED: a text lookup beside the email one
├── app/
│   ├── (site)/page.tsx               # CHANGED: reads state; consent step or placeholder
│   ├── api/guest/sign-in/route.ts    # CHANGED: identifier, phone path, neutral answer
│   ├── api/guest/sms-consent/route.ts# NEW
│   ├── api/webhooks/twilio/route.ts  # NEW
│   ├── api/admin/households/…/phones # NEW: add, change, remove a phone
│   ├── t/[token]/route.ts            # NEW: the timed sign-in link
│   └── (admin)/admin/(console)/…     # CHANGED: layout supplies the banner; forms and views per state
└── components/
    ├── site/{SignInPrompt,ConsentStep,Home}.tsx   # CHANGED / NEW (consent step)
    └── admin/{AdminShell,SmsBanner,…}.tsx         # CHANGED / NEW (banner and phone views)
docs/                                 # CHANGED: guest-api, admin-api, manual-setup (Twilio), architecture, decision record
.env.example, CLAUDE.md               # CHANGED: new variable names; layout rows
```

**Structure Decision**: one Next.js app as today. The Twilio library is confined to `src/lib/sms/twilio.ts` and the server state helper is the single place that reads the provider's settings. Wording lives in `texts/` so it can be polished apart from logic.

## Complexity Tracking

None.
