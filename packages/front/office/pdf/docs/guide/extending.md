# Extending via `.use()`

The public [`pdf`](../api/pdf.md) API exposes an extension hook `.use(extension)` to add methods without modifying the core. This guide shows the extension shape, the idempotence rule and how the bundles use the same hook.

**Prerequisites** — the package `@awacloud/pdf` (root entry
`@awacloud/pdf`, or the committed `@awacloud/pdf/standalone/*` build) and its
`@awacloud/fw` / `@awacloud/fonts` dependencies; any modern JavaScript runtime
(browser main thread or Worker, Bun, Node.js 18+).

## Shape of an extension

```js
{
    name: 'unique-identifier',           // string, kebab-case recommended
    register(api, ctx) {                 // ctx = { usedExtensions: Set }
        return { someNewMethod() { /* … */ } };
    }
}
```

`register` receives the current API and can:

- consume its methods (`api.read`, `api.header`, …) to compose behaviour;
- return an object whose keys (except `use`) are merged into the public API;
- return `undefined` for a pure side effect (no new method).

## Idempotence by name

`.use()` is **idempotent**: applying the same `name` twice is a silent no-op. No double-merge, no error. The internal `usedExtensions` set is queryable via `api.usedExtension(name)`.

```js
const ext = { name: 'demo', register: () => ({ ping: () => 42 }) };

api.use(ext);
api.use(ext);                     // no-op
api.ping();                       // 42
api.usedExtension('demo');        // true
```

## Validation

A malformed extension (missing `name` or `register`) throws `ContractError` (`pdf/use/bad-extension`). See [`pdfErrors`](../api/errors.md).

## Example — count annotations

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);

const api = rt.resolve('pdf');

api.use({
    name: 'count-annots',
    register(api) {
        return {
            countAnnots(bytes) {
                return api.read(bytes).pages
                    .reduce((n, p) => n + p.annots.length, 0);
            }
        };
    }
});

api.countAnnots(bytes);           // → int
```

## See also

- [`pdf` orchestrator](../api/pdf.md)
- [`pdfErrors`](../api/errors.md)
- [Coverage](./coverage.md) — the extras planned/shipped through this hook.
