# Playground — ESLint (`fw/no-factory-capture`)

Demonstrates the custom rule [`fw/no-factory-capture`](../../../integrations/eslint/no-factory-capture.js):
a module `factory()` must be **self-contained** because `runtime.serialize()` ships
`factory.toString()` into a Worker, where the module's outer scope does not exist.
Capturing a module-scope binding breaks worker bootstrap — the rule flags it at edit time.

## Run

```sh
npm i
```

Run from this directory. Then:

```sh
npx eslint bad-module.js    # shows the capture error
npx eslint good-module.js   # passes (no output)
```

## Files

- `eslint.config.js` — flat config; registers `fw/no-factory-capture: 'error'` on `*.js`.
- `bad-module.js` — factory captures the module-scope const `MULTIPLIER` → **lint error**.
- `good-module.js` — `MULTIPLIER` declared inside the factory → **passes**.
