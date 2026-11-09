# Quickstart: validating the placeholder homepage

## Automated

```bash
npm run format:check && npm run lint && npm run type-check && npm test && npm run build
```

`npm run build` matters here because a new root layout is added.

## Walkthrough (preview deployment or `npm run dev` with local Supabase)

Prerequisites: a household with an email address, and a staff user (`scripts/create-staff-user.ts`).

1. **Signed out.** In a private window open `/`. Expect the sign-in prompt, not "not found".
2. **Guest link by typed address.** Type the household's address. Expect the neutral message. Open the emailed link in the same browser. Expect `/` showing "Coming soon 👀" centered, with the toggle and "Sign out".
3. **Unknown address.** Type an address on neither list. Expect the same message and about the same wait. Nothing arrives.
4. **Staff by typed address.** In a fresh window type the staff address. Expect the same message, then a staff email. Open it in the same browser. Expect the admin console. In the sidebar, press "View home page": a new tab opens on the placeholder, still signed in.
5. **Personal invite link.** Open a household's `/i/<token>` link signed out. Expect to land on `/` signed in.
6. **Theme.** With the device in dark, expect dark; press the toggle, expect light; reload, still light. Block storage in the browser: the page still renders and toggles for the visit. Reload at phone, tablet and desktop widths: the line stays centered.
7. **Sign out.** Press "Sign out" on `/`: the prompt returns. Sign a household in on two devices, sign out on one: the other stays signed in.
8. **Bad link.** Open a used or invalid sign-in link: the failure page appears and its link goes back to `/`.

Known limit: a staff link must be opened in the browser that asked for it; elsewhere it ends on the failure page.

## Production check

After merge, open `https://hannahandchris.wedding/` and repeat steps 1, 2 and 4. Confirm the deployment with the `vercel` skill (latest deployment `READY`).
