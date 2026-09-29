# `@awacloud/fw` — ESLint

ESLint guards that **encode framework invariants**. Consumed by the `eslint.config.js` at the root of the package (no `@awacloud/fw/<x>` export — this is internal dev tooling).

## Contents

- [`no-factory-capture.js`](./no-factory-capture.js) — custom rule `fw/no-factory-capture`. Forbids a module `factory()` from capturing a module-scope binding (scope analysis: `v.defs.length === 0` excludes ambient globals). **Invariant**: factories must be self-contained (`factory.toString()` is serialized to Workers) — a capture would break Worker execution.

## Other guards live in `eslint.config.js` (root)

The root `eslint.config.js` **derives** its rules from the source of truth (the sanity layer) rather than hard-coding them:

- `no-restricted-globals` / `no-restricted-properties` — generated from the `BLOCKED_*` entries in `src/sanity/base.js`.
- `no-restricted-syntax` — anti-assignment guard for frozen prototypes, built by introspection (`Object.getOwnPropertyNames(<Ctor>.prototype)`) for the 9 frozen built-ins.
- Layers by scope: `src/**` (sanity + `fw/no-factory-capture`), `tools|integrations/**` (Node/Bun globals), tests/playground/`.d.ts` (relaxed guards).

Gate: `bun run lint` = `eslint . --max-warnings 0`.

## Usage

```js
// eslint.config.js (package root)
import fw from './integrations/eslint/no-factory-capture.js';
// … fw.rules['no-factory-capture'] wired into the src/** layer
```

See the root `eslint.config.js` for the full wiring (sanity derivation → rules).
