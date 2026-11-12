# Quickstart: validate the setup guide

Prerequisites: `npm install`; for the database tests, the local Supabase (`npm run db:start`, needs Docker) or CI.

## Automated

```bash
npm run format:check && npm run lint && npm run type-check && npm test
npm run test:db      # row-level security of the two new tables (needs Docker or CI)
```

## By hand (local dev, `npm run dev`, signed in as a couple member)

1. Start with `RESEND_API_KEY`, `EMAIL_FROM` and `CRON_SECRET` unset and no wedding event chosen. Open `/admin`: the full banner reads "Setup isn't finished" with the required count. The texting banner is gone.
2. Choose "Start setup". The guide opens on the first open step. Set the wedding event inside the guide and save: the step marks itself done and the guide moves on, announced by the status line.
3. On an outside step, follow the shown instructions, set the values in `.env.local`, restart the dev server, choose "Check again": the step becomes done.
4. Press Escape. The guide closes, focus returns to the button that opened it, and the compact reminder shows progress. Reload and sign in elsewhere: the same reminder shows.
5. "Resume setup" opens the guide on the step you left. Skip a step: it shows as skipped and still counts as open. "Restart" clears skips and position and leaves site values alone.
6. Finish every required step: the banner vanishes on every page. The nav link "Setup guide" still opens it, with "Change" controls and a "recommended" count.
7. Sign in as the planner: the texting switch step is read-only with "Only the couple can change this"; every other console step saves.
8. Unset a value again and reload: the banner returns and the step is open.
9. Phone width (about 390px): the banner stacks, the guide is a bottom sheet, no sideways scroll. Tab through the guide with the keyboard only.

See [spec.md](./spec.md) for the requirements, [data-model.md](./data-model.md) for the two tables, and [contracts/setup-guide.md](./contracts/setup-guide.md) for the catalogue and actions.
