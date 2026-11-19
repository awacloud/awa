# Playground — Vitest

Mini-consumer running a test written in `bun:test` style **under Vitest /
Node**, without touching the test. See the integration
[`@awacloud/fw/vitest`](../../../integrations/vitest/README.md).

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run test
```

`bun run test` runs Vitest once.

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
