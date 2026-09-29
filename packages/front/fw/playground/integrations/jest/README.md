# Playground — Jest

Mini-consumer running a `bun:test`-style test under Jest (native ESM).

See the integration: [`@awacloud/fw/jest`](../../../integrations/jest/README.md).

## Run

```sh
npm i && node --experimental-vm-modules node_modules/jest/bin/jest.js -c jest.config.mjs
```

Run from this directory (or `npm test`).

## Mechanism

- `jest.config.mjs`: `moduleNameMapper` remaps `^bun:test$` → `@awacloud/fw/jest/shim`
  (resolved via `createRequire(import.meta.url).resolve(...)`).
- `transform: {}` (no transpilation) + `--experimental-vm-modules` flag for ESM.
- `testEnvironment: 'node'`.
