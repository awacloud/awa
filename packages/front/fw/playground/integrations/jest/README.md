# Playground — Jest

Mini-consumer running a `bun:test`-style test under Jest (native ESM).

See the integration: [`@awacloud/fw/jest`](../../../integrations/jest/README.md).

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run test
```

`bun run test` runs Jest on the ESM test files.

## Mechanism

- `jest.config.mjs`: `moduleNameMapper` remaps `^bun:test$` → `@awacloud/fw/jest/shim`
  (resolved via `createRequire(import.meta.url).resolve(...)`).
- `transform: {}` (no transpilation) + `--experimental-vm-modules` flag for ESM.
- `testEnvironment: 'node'`.
