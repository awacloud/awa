# Read pipeline

`api.read(bytes)` runs five successive steps, each wired to an independently documented module. This guide walks them in order and ends with a complete example.

**Prerequisites** — the package `@awacloud/pdf` (root entry
`@awacloud/pdf`, or the committed `@awacloud/pdf/standalone/*` build) and its
`@awacloud/fw` / `@awacloud/fonts` dependencies; any modern JavaScript runtime
(browser main thread or Worker, Bun, Node.js 18+).

## Overview

```
   bytes (Uint8Array)
       │
       ▼
  [1] readHeader      →  %PDF-x.y      §7.5.2  →  pdfDocument
       │
       ▼
  [2] locate + parse xref  + /Prev chain  §7.5.4-7.5.5  →  pdfXref
       │
       ▼
  [3] typeTrailer    →  { size, root, info?, prev?, … }   →  pdfTrailer
       │
       ▼
  [4] resolve(root) + typeCatalog       §7.7.2            →  pdfCatalog
       │
       ▼
  [5] walkPageTree + typePage           §7.7.3            →  pdfPages / pdfPage
       │
       ▼
   doc = { version, catalog, pages, trailer, xref, _raw }
```

## Step by step

### 1. Header (`readHeader`)

Searches for `%PDF-x.y` in the first 1024 bytes (ISO §7.5.2 tolerance). Returns `{ version, end }`. See [`pdfDocument`](../api/document/document.md).

### 2. Xref

`locateStartXref(bytes)` scans the last 8192 bytes for `startxref`. `readStartXref` reads the numeric offset. The section walk then follows the `/Prev` chain, choosing a form per section from the bytes it finds: `parseXrefTable` for a classical `xref` section, `pdfCrossRefStream.parseCrossRefStream` for a `/Type /XRef` stream (§7.5.8), with `pdfObjStream` materialising anything stored in a `/Type /ObjStm` container (§7.5.7). A classical trailer's `/XRefStm` pointer (hybrid-reference file) is followed as well. See [`pdfXref`](../api/syntax/xref.md).

### 3. Trailer

`parseTrailerDict` reads the dict, `typeTrailer` extracts `/Size`, `/Root`, and the optional `/Info`, `/Prev`, `/ID`, `/Encrypt`. See [`pdfTrailer`](../api/syntax/trailer.md).

### 4. Catalog

`resolve(trailer.root)` materialises the Catalog's indirect object; `typeCatalog` extracts `/Pages`, `/Version`, `/PageLayout`, `/Outlines`, `/Metadata`, … See [`pdfCatalog`](../api/document/catalog.md).

### 5. Pages

`walkPageTree(catalog.pages, resolve)` produces the ordered list of leaf refs; each is resolved then passed to `typePage`. See [`pdfPages`](../api/document/pages.md) and [`pdfPage`](../api/document/page.md).

## Indirect-object resolver

The document exposes `doc._raw.resolve(ref)` to follow any untyped `{ type: 'ref', num, gen }` (Metadata, Outlines, Annots, …). The `indirects` cache avoids re-materialising the same object twice.

## End-to-end example

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);

const api = rt.resolve('pdf');
const doc = api.read(bytes);

for (const page of doc.pages) {
    console.log(page.mediaBox, page.rotate, page.contents.length);
}

// Follow an untyped ref (e.g. outlines)
if (doc.catalog.outlines) {
    const outlines = doc._raw.resolve(doc.catalog.outlines);
    console.log(outlines.entries);
}
```

## See also

- [Getting started](./getting-started.md)
- [Coverage](./coverage.md)
- [`pdfDocument`](../api/document/document.md)
