# Playground — Vitest

Mini-consumer running a test written in `bun:test` style **under Vitest /
Node**, without touching the test. See the integration
[`@awacloud/fw/vitest`](../../../integrations/vitest/README.md).

## Run

```sh
npm i && npx vitest run
```

Run from this directory.

## What it shows

- The `bun:test` → `@awacloud/fw/vitest/shim` shim via `resolve.alias` in
  [`vitest.config.js`](./vitest.config.js) — the `.test.js` imports from
  `bun:test` with no rewriting at all.
- `test.environment: 'node'`: a pure test + a DOM test that auto-registers
  happy-dom at the top of the file (exactly as under bun).

## Files

- `src/calc.js` — trivial module (`add`).
- `src/calc.test.js` — `import { describe, test, expect } from 'bun:test'`.
- `vitest.config.js` — `bun:test` → shim alias (`createRequire(...).resolve('@awacloud/fw/vitest/shim')`).
