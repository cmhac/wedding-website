# Research: how to design a setup guide in a web app

Gathered 2026-11-12 from public design-system pages and practitioner write-ups. Most
sources are vendor docs and blogs, not studies, so each finding says how strong its
source is. None of it is a standard.

## What the sources agree on

1. **Let people leave at any point, without penalty.** Setup guides and checklists
   should be dismissible and skippable, and should not block the product
   ([Shopify's setup guide pattern](https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide),
   [Shopify's onboarding guidance](https://shopify.dev/docs/apps/design/user-experience/onboarding),
   [SaaS UI patterns](https://www.saasui.design/blog/saas-onboarding-checklist-ux-patterns)).
   Shopify's own guidance is to let merchants finish onboarding later.
2. **Leaving is not the same as finishing.** Two real products treat "hide for now"
   and "never show again" differently: Atlas offers a snooze until the next visit
   plus a permanent dismiss and recommends snoozing while setup is unfinished
   ([Atlas help](https://intercom.help/helloatlas/en/articles/13248127-how-do-i-skip-resume-or-restart-store-setup-in-shopify-s-atlas-app));
   Aftersell hides an incomplete guide only for the session and lets the dismissal
   stick only once the area is complete
   ([Aftersell docs](https://aftersell.mintlify.app/aftersell/home/setup-guide.md)).
   Both are product-specific behaviours, not rules.
3. **Make resuming obvious.** A usability write-up on wizards warns that many offer
   "save and exit" but do not make it clear how to resume, or force people to click
   through finished steps again
   ([Center Centre, "When to Develop a Wizard"](https://articles.centercentre.com/wizard)).
   Visa's design system recommends autosave so leaving never loses progress
   ([Visa wizard guidance](https://design.visa.com/patterns/wizard/usage/)).
4. **Keep it short and show progress.** Shopify advises no more than five steps in an
   onboarding flow, with completion marked automatically and a progress line such as
   "2 out of 5 steps completed"
   ([Shopify](https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide)).
   Showing finished steps, rather than hiding them, keeps the sense of progress
   ([SaaS UI patterns](https://www.saasui.design/blog/saas-onboarding-checklist-ux-patterns)).
   Claims that a part-filled progress bar motivates people come from vendor blogs;
   treat them as unproven.
5. **Mark steps done from the real state, not from a click.** Practitioners advise
   deriving task completion from existing records so a refresh restores the truth,
   and storing only pure interface state (skipped, dismissed, current step) separately
   ([Rails Blocks checklist guide](https://railsblocks.com/docs/onboarding-checklist),
   [a worked example](https://github.com/recoupable/chat/pull/1872)). Whether interface
   state belongs in the browser or on the server depends on whether it must follow the
   person between devices ([fault-tolerant onboarding write-up](https://dev.to/petprog/designing-fault-tolerant-onboarding-how-to-resume-user-progress-after-reinstall-3j23)).
6. **Keyboard and screen-reader behaviour.** Where a guide opens as a dialog, the
   common guidance is a named dialog, focus moved in on open, Escape to close, and
   focus returned to the control that opened it. WCAG 2.1.2 (No Keyboard Trap)
   requires that focus can always be moved away by standard keys
   ([accessible onboarding guide](https://kompassify.com/blog/accessible-onboarding-guide),
   [Vispero dialog checklist](https://vispero.com/?p=22573)). One Mozilla bug thread
   notes Escape-to-dismiss is a widely used practice rather than a direct WCAG
   requirement ([Bugzilla](https://bugzilla.mozilla.org/show_bug.cgi?id=1788253)).

## Not found

- No authoritative source (for example the Nielsen Norman Group wizard article) could
  be read directly; the points above come from secondary sources.
- No research showing which exit wording or banner placement works best. These choices
  are judgment calls and are listed as assumptions in the spec.

## How the findings shape this spec

| Finding                     | Where it lands                                                  |
| --------------------------- | --------------------------------------------------------------- |
| Leave any time              | FR on leaving, skipping, and never blocking the console         |
| Hide for now vs. done       | Leaving keeps a small reminder; only real completion removes it |
| Obvious resume              | The reminder says "Resume setup" with progress                  |
| Short, progress shown       | Steps grouped; finished steps stay visible                      |
| Derive from real state      | Completion is never stored; only skips and position are stored  |
| Follow the person           | Interface state is kept per staff member, not per browser       |
| Keyboard and screen readers | Accessibility requirements                                      |
