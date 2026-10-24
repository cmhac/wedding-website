# 0002: Hosting

Status: accepted (2026-10-19)

Run the Next.js app on a host that executes Next.js server code; Vercel is the
default recommendation. Do not set `output: "export"`.

Why: guest sign-in uses server-side auth cookies, and webhooks, sends, and
scheduled dispatch run in route handlers. A static export (as the portfolio
site uses on GitHub Pages) cannot do this. The host must support Node 26 (see 0001) and hold the server-only variables listed in
`specs/001-guest-data-model/quickstart.md`.

Alternatives: static export (no server code); self-hosted Node (more upkeep).

Revisit if the chosen host cannot run Node 26, or if hosting cost matters.
