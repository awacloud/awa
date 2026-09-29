# `@awacloud/fw/jest`

Run the test suite **under Jest / Node**, without touching the tests. An alternative to [Vitest](../vitest/README.md) for teams already invested in Jest.

> **Vitest remains the recommended Node runner** (ESM-first, trivial config). Jest works but its ESM support is more involved — see Notes.

## Mechanism

Same principle as Vitest: a **shim** remaps `bun:test` → `@jest/globals`.

1. [`bun-test-shim.js`](./bun-test-shim.js): re-exports `describe/test/expect/before*/after*` from `@jest/globals`, and **bridges `test.if(cond)`** (bun API absent from Jest) → `cond ? test : test.skip`. The **`done` callback is natively supported** by Jest (nothing to bridge).
2. [`jest.config.mjs`](https://github.com/awacloud/awa/blob/main/packages/front/fw/integrations/jest/jest.config.mjs): `moduleNameMapper` `^bun:test$` → shim, `transform: {}` (native ESM), `testEnvironment: 'node'`.

## DOM — `environment: 'node'` is enough

As under bun/Vitest, DOM tests register happy-dom themselves (`GlobalRegistrator.register()` at the top of the file). No need for `jest-environment-jsdom` or `projects`: Node + these self-registrations reproduce the environment.

## Usage

```sh
bun run setup:jest    # installs jest + @jest/globals on demand (not persisted)
bun run test:jest     # node --experimental-vm-modules node_modules/jest/bin/jest.js -c integrations/jest/jest.config.mjs
```

The **`--experimental-vm-modules`** flag is passed via `node` (cross-platform, no env variable). The DOM comes from `@happy-dom/global-registrator` (committed devDependency).

## For a consumer project

```js
// jest.config.mjs
import { createRequire } from 'node:module';
const shim = createRequire(import.meta.url).resolve('@awacloud/fw/jest/shim');
export default {
    moduleNameMapper: { '^bun:test$': shim },
    transform: {},
    testEnvironment: 'node',
};
```

## Notes

- **ESM under Jest = the real hard part**: `transform: {}` + `--experimental-vm-modules`. `import.meta.url` (used by the runtime/crypto tests for `tests/_vectors`) works under vm-modules but remains a point of attention. If a full run fails, **prefer Vitest**.
- `*.kat.js` (data files) excluded from `testMatch`, but loaded via import by the `.test.js` files.
- Jest is **not** a committed devDependency; installed on demand (`bun add --no-save`).
- bun↔jest matcher parity is very high (bun:test mirrors Jest) — validate on a full run.
