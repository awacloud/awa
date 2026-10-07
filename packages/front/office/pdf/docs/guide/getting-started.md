# Getting Started

`@awacloud/pdf` reads and writes PDF documents in pure JavaScript, browser-side, with no runtime dependency beyond `@awacloud/fw` and `@awacloud/fonts`. This guide installs the package, wires it on a `ModuleRuntime` and reads a first document.

**Prerequisites** — the package `@awacloud/pdf` (root entry
`@awacloud/pdf`, or the committed `@awacloud/pdf/standalone/*` build) and its
`@awacloud/fw` / `@awacloud/fonts` dependencies; any modern JavaScript runtime
(browser main thread or Worker, Bun, Node.js 18+).

## Install

```bash
npm install @awacloud/pdf
```

Browser import map:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":     "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/":    "/node_modules/@awacloud/fw/src/",
    "@awacloud/fonts":  "/node_modules/@awacloud/fonts/src/main.js",
    "@awacloud/fonts/": "/node_modules/@awacloud/fonts/src/",
    "@awacloud/pdf":    "/node_modules/@awacloud/pdf/src/main.js",
    "@awacloud/pdf/":   "/node_modules/@awacloud/pdf/src/"
}}
</script>
<script type="module" src="./app.js"></script>
```

## With `@awacloud/fw` `ModuleRuntime`

`pdf` is a **strict factory-only descriptor** — its `factory` takes 13
positional dependency arguments and has no zero-argument convenience
form. Materialise a working instance by registering the package's manifest
arrays on a `ModuleRuntime` and resolving by name (or use the committed
`@awacloud/pdf/standalone/pdf.js` build, whose `pdfBundled.factory()`
takes no arguments):

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);   // @awacloud/fw crypto/io modules
for (const m of pkg_require) rt.register(m);   // @awacloud/fonts subset helpers
for (const m of modules)     rt.register(m);   // @awacloud/pdf's own modules

const api = rt.resolve('pdf');
const doc = api.read(bytes);              // bytes: Uint8Array

console.log(doc.version);                 // header version, e.g. "1.7" or "2.0"
console.log(doc.pages.length);            // → page count
console.log(doc.pages[0].mediaBox);       // the page's own /MediaBox, or null when inherited
```

`modules` is topologically ordered — registration order only matters in
that every dependency must be registered before `resolve('pdf')` is
called; `ModuleRuntime` resolves each declared dependency by name
regardless of array order.

## Reading just the header

```js
api.header(bytes);
// → { version: '2.0', end: <offset> }   (the header's own version)
```

## Next steps

- [Detailed read pipeline](./read-pdf.md)
- [Extending via `.use()`](./extending.md)
- [Coverage](./coverage.md)
- [API index](../api/README.md)
