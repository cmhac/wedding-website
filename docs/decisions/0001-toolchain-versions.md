# 0001: Toolchain versions

Status: accepted (2026-10-17)

The policy is to use the newest release of every tool, except where the
ecosystem blocks it.

## Exceptions

- **TypeScript is pinned to 6.0.x, not 7.x.** `typescript-eslint` (8.71.2 at the
  time of writing) declares `typescript >=4.8.4 <6.1.0` and throws at startup on
  TypeScript 7, which breaks `npm run lint`. `tsc` 7 itself works. Revisit when
  `typescript-eslint` ships TypeScript 7 support:
  https://github.com/typescript-eslint/typescript-eslint/issues/12518
- **ESLint 10 runs ahead of some plugin peer ranges.** `eslint-plugin-react`,
  `eslint-plugin-import` and `eslint-plugin-jsx-a11y` (bundled with
  `eslint-config-next`) declare support only up to ESLint 9, so `npm install`
  prints peer warnings. Lint runs and the TypeScript, React Hooks, Next.js and
  a11y rules all fire. If a plugin starts misbehaving, drop to ESLint 9.

## Runtime

- Node 26 (`.nvmrc`); `engines` allows Node 24 or newer. Node 24 was the Active
  LTS when this was written. Node 26 was scheduled to enter LTS later in
  October 2026 (see https://github.com/nodejs/Release). Check that the hosting
  provider supports it before deploying.
- `@types/node` tracks the runtime major (26).
