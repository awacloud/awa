# `@awacloud/fw/vitest`

Run the test suite **under Vitest / Node**, without touching the tests. The default runner remains `bun test`; Vitest is the Node option (CI without bun, or alternative Node backend).

## The single friction point: `import … from 'bun:test'`

Actually used surface across the **174** `*.test.js` files:

```
describe, test, expect, beforeEach, afterEach, beforeAll, afterAll
```

**Zero** `mock` / `spyOn` / `it` / `vi` / `jest`. Since `bun:test` mirrors Jest, all these symbols exist identically in Vitest. The swap is a simple **specifier remap** `bun:test` → a shim — no rewriting.

## Mechanism

1. **Shim** [`bun-test-shim.js`](./bun-test-shim.js): re-exports the 7 symbols from `vitest`.
2. **Alias** in [`vitest.config.js`](./vitest.config.js): `bun:test` → shim. Every `import { test } from 'bun:test'` resolves to Vitest. The `.test.js` files are unchanged.

## DOM — why `environment: 'node'` is enough

Under bun, there is **no** DOM preload: DOM tests register happy-dom themselves at the top of the file:

```js
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }
```

Vitest in `environment: 'node'` therefore reproduces **exactly** the bun environment: these self-registrations install the DOM where needed. No `environment: 'happy-dom'`, no `environmentMatchGlobs`.

## Usage

```sh
bun run setup:vitest   # once — installs vitest (not persisted)
bun run test:vitest    # vitest run -c integrations/vitest/vitest.config.js
```

> The DOM for the tests comes from `@happy-dom/global-registrator`, a **committed devDependency** of `fw` (tests register it themselves) — no need to install it via `setup:vitest`.

## For a consumer project

Reuse the shim in your own `vitest.config`:

```js
import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
const shim = createRequire(import.meta.url).resolve('@awacloud/fw/vitest/shim');

export default defineConfig({
    test: { alias: [{ find: /^bun:test$/, replacement: shim }] },
});
```

## API gaps bridged by the shim (without touching the tests)

bun:test mirrors Jest, but two **bun** APIs absent from Vitest 4 are filled in by the shim:

| bun API | Vitest 4 | Shim bridge |
|---|---|---|
| `done` callback (`test('x', (done) => …)`) | removed | detected (1-arg function) → converted to a promise |
| `test.if(cond)` | `test.runIf(cond)` | `if` mapped to `runIf` |

→ no test file modified.

## Result (full run)

`8344 passed, 7 skipped, 2 failed` across **174 files**. The 2 failures are in `src/io/time/date.test.js` and **are not swap issues**: they are genuine **engine differences** between bun (JSC) and Node (V8/ICU) —

- `Intl.supportedValuesOf('timeZone')`: 455 zones with `'UTC'` under bun, **418 without `'UTC'`** under Node;
- `diff(..., 'days')`: date arithmetic across a DST transition (44 vs 45).

These differences are a **portability signal** (relevant for a Node backend/runtime), to address in the `date` module — not in the Vitest integration.

## Notes

- `*.kat.js` (crypto vectors) excluded.
- Vitest is **not** a committed devDependency; installed on demand via `bun run setup:vitest` (`bun add --no-save`). The consumer prerequisite (`vitest`) is documented here rather than declared as a peer — see [`../_e2e/README.md`](https://github.com/awacloud/awa/blob/main/packages/front/fw/integrations/_e2e/README.md) for the dependency policy.
