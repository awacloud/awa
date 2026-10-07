---
module: pdf
category: pdf
dependencies: [pdfErrors, pdfShared, pdfTokenizer, pdfParserObj, pdfParser, pdfXref, pdfTrailer, pdfSerializer, pdfCatalog, pdfPages, pdfPage, pdfDocument, pdfWriter]
returns: object
worker-safe: true
status: complete
---

# pdf

> Top-level public orchestrator — `read`, `header`, `write`, and the `.use()` extension hook.

**Module** `pdf` | **Source** `packages/front/office/pdf/src/pdf.js` | **Deps** `pdfErrors`, `pdfShared`, `pdfTokenizer`, `pdfParserObj`, `pdfParser`, `pdfXref`, `pdfTrailer`, `pdfSerializer`, `pdfCatalog`, `pdfPages`, `pdfPage`, `pdfDocument`, `pdfWriter` | **Worker-safe** yes

The syntax + document layers are declared as `dependencies[]` and received as positional factory parameters; the file's top-level `import`s only bring in the dependency descriptors for the generated `deps` companion, and there is no internal bootstrap. `pdf.factory()` therefore cannot be called with no arguments. Register `fw_require` and `modules` from `src/main.js` into a `@awacloud/fw` `ModuleRuntime` to resolve it, or use the committed `dist/standalone/pdf.js` build, whose `pdfBundled.factory()` takes no arguments (same returned API either way). See [`main`](./main.md) for DI registration.

## Resolve

```js
const api = runtime.resolve('pdf');
// Returns: { read, header, write, use, usedExtension }
```

Or stand-alone, from the committed framework-free build:

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';
const api = pdfBundled.factory();
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `read` | `(bytes: Uint8Array, opts?: { allowEncrypted?: boolean }) => Document` | Full typed document — see [`pdfDocument`](./document/document.md). Throws `pdf/document/encrypted` on an encrypted document unless `opts.allowEncrypted === true`. |
| `header` | `(bytes: Uint8Array) => { version: string, end: number }` | Header only, without parsing the rest. |
| `write` | `(model: Document \| WriteModel, opts?: { strict?, onSkipped? }) => Uint8Array` | Serializes a document model back to bytes. When `model._raw.resolve` is a function (i.e. `model` is a `Document` returned by `read`), builds the write model from it (indirects, root, info, id, version `'2.0'`) via `pdfWriter`'s `assembleIndirects`; otherwise passes `model` straight through to `pdfWriter.writeDocument`. The result carries a non-enumerable `skippedObjects` property — see [`pdf.write(model, opts)`](#pdfwritemodel-opts). |
| `use` | `(ext: { name: string, register: function }) => api` | Applies an extension (idempotent per `name`). |
| `usedExtension` | `(name: string) => boolean` | Tests whether an extension is wired. |

### `pdf.write(model, opts)`

A `Document` returned by `read` can hold in-use xref entries that cannot be resolved (a damaged object, a truncated stream). By default `write` is lenient: it drops those objects and still returns bytes, so the loss must be made visible.

| Option | Type | Effect |
|--------|------|--------|
| `strict` | `boolean` | Only the value `true` counts (a truthy non-boolean such as `'yes'` or `1` stays lenient). With `strict: true`, `write` throws `pdf/writer/unresolvable-objects` instead of dropping anything; the error's `context.objects` lists every unresolvable entry. |
| `onSkipped` | `(skipped) => void` | Lenient mode only. Called once, with a copy of the skip list, when at least one object was dropped. Never called when nothing was skipped or when `strict: true` throws. Anything that is not a function is ignored. |

The returned `Uint8Array` always has a non-enumerable `skippedObjects` property: an array of `{ num, gen, code }` entries, one per dropped object (`code` is the caught error's `pdf/…` code, or `'unknown'`). It is `[]` for a clean `Document` and for a raw `WriteModel`. Being non-enumerable, it does not show up in `Object.keys`, spreading, `JSON.stringify` or `toEqual`, so the bytes compare exactly as before. A raw `WriteModel` has no xref to resolve, so `opts` is ignored for it. `write(model)` with no `opts` produces the same bytes as before.

### `pdf.use(ext)`

`ext.register(api, ctx)` is invoked with `ctx = { usedExtensions: Set<string> }`. If the return value is an object, its keys (except `use`) are merged into the API in place. The `api` object's identity is preserved — safe to capture.

Applying the same `name` twice is a no-op (returns `api` without calling `register` again). See [`extending.md`](../guide/extending.md).

## Examples

### Read through a runtime

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of modules)    rt.register(m);

const api = rt.resolve('pdf');
const doc = api.read(bytes);
console.log(doc.version, doc.pages.length);
```

### Header only (quick smoke test)

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';

const { version, end } = pdfBundled.factory().header(bytes);
// version: the header's version, e.g. '1.7' or '2.0'; end: offset after the header line
```

### Write back

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';

const api = pdfBundled.factory();
const doc = api.read(bytes);
const out = api.write(doc);   // Uint8Array
```

### Write strictly

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';

const api = pdfBundled.factory();
const doc = api.read(bytes);
const out = api.write(doc, { strict: true });   // throws pdf/writer/unresolvable-objects if anything would be dropped
```

### Inspect what a lenient write dropped

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';

const api = pdfBundled.factory();
const doc = api.read(bytes);
const out = api.write(doc, {
    onSkipped(skipped) { console.warn(`${skipped.length} object(s) dropped`); }
});
for (const { num, gen, code } of out.skippedObjects) {
    console.warn(`object ${num} ${gen} was not written (${code})`);
}
```

### `.use()` hook

```js
import { pdfBundled } from '@awacloud/pdf/standalone/pdf.js';

const api = pdfBundled.factory().use({
    name: 'count-annots',
    register(self) {
        return {
            countAnnots(b) {
                return self.read(b).pages.reduce((n, p) => n + p.annots.length, 0);
            }
        };
    }
});
api.countAnnots(bytes);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/use/bad-extension` | `ContractError` | `.use()` receives anything other than `{ name: string, register: function }`. |
| `pdf/writer/unresolvable-objects` | `RenderError` | `.write(doc, { strict: true })` on a `Document` holding at least one in-use xref entry that cannot be resolved; `context.objects` is the `{ num, gen, code }` list. |

`.read()` propagates every code from [`pdfDocument`](./document/document.md) (`pdf/document/*`, `pdf/xref/*`, …); `.write()` propagates `pdfWriter`'s other codes.

## See also

- [`pdfDocument`](./document/document.md) — back-end of `read` / `header`.
- [`pdfErrors`](./errors.md)
- [Extending via `.use()`](../guide/extending.md)
- [Getting started](../guide/getting-started.md)
