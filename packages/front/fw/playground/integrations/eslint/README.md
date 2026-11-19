# Playground — ESLint (`fw/no-factory-capture`)

Demonstrates the custom rule [`fw/no-factory-capture`](../../../integrations/eslint/no-factory-capture.js):
a module `factory()` must be **self-contained** because `runtime.serialize()` ships
`factory.toString()` into a Worker, where the module's outer scope does not exist.
Capturing a module-scope binding breaks worker bootstrap — the rule flags it at edit time.

## Run

Once, from `packages/front/fw`: `bun run setup:playground` (it builds the fw bundles and type declarations the playgrounds read; both are git-ignored, a published package ships them). Then, from this directory:

```sh
bun install && bun run lint
```

The command **exits 1 by design**: the `fw/no-factory-capture` rule reports the capture in `bad-module.js` and passes `good-module.js`. Lint one file with `bunx eslint good-module.js` (exit 0) or `bunx eslint bad-module.js` (exit 1).

## Files

- `eslint.config.js` — flat config; registers `fw/no-factory-capture: 'error'` on `*.js`.
- `bad-module.js` — factory captures the module-scope const `MULTIPLIER` → **lint error**.
- `good-module.js` — `MULTIPLIER` declared inside the factory → **passes**.
