---
module: pdfPages
category: pdf/document
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfPages

> Page-tree walker, ISO 32000-2 §7.7.3 — `/Pages` tree → ordered list of leaf references.

**Module** `pdfPages` | **Source** `packages/front/office/pdf/src/document/pages.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Descends `/Kids` recursively from the root pointed at by the Catalog. Guard
rails: maximum depth (`maxDepth = 64`), maximum page count
(`maxPages = 200000`), cycle detection through a `Set<'num:gen'>`. Tolerant of
intermediate nodes without `/Type` (present in some older PDFs): the fallback
test is the presence of `/Kids`.

## Resolve

```js
const pages = runtime.resolve('pdfPages');
// Returns: { walkPageTree, readPageCount }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `walkPageTree` | `(rootRef, resolveRef, opts?: { maxDepth?, maxPages? }) => Array<{num, gen}>` | Leaf references in document order. |
| `readPageCount` | `(node: PdfDict) => number \| null` | Reads `/Count` off an intermediate node. |

`resolveRef` must accept `{ type: 'ref', num, gen }` and return the materialised
dictionary — typically `doc._raw.resolve`.

## Examples

### Standard walk

```js
const pages = runtime.resolve('pdfPages');
const refs  = pages.walkPageTree(doc.catalog.pages, doc._raw.resolve);
refs.length;             // page count
refs[0];                 // { num: 3, gen: 0 }
```

### `/Count` sanity check

```js
const root = doc._raw.resolve({ type: 'ref', ...doc.catalog.pages });
const declared = pages.readPageCount(root);
const actual   = pages.walkPageTree(doc.catalog.pages, doc._raw.resolve).length;
if (declared !== null && declared !== actual) {
    console.warn('page tree /Count mismatch', { declared, actual });
}
```

### Limiting the depth

```js
pages.walkPageTree(rootRef, resolve, { maxDepth: 16 });
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/pages/max-depth` | `ParseError` | Tree deeper than `maxDepth`. |
| `pdf/pages/cycle` | `ParseError` | Reference already visited during the walk. |
| `pdf/pages/not-dict` | `ParseError` | A resolved node is not a dictionary. |
| `pdf/pages/too-many` | `ParseError` | More than `maxPages` leaves found. |
| `pdf/pages/missing-kids` | `ParseError` | Intermediate node without `/Kids`. |
| `pdf/pages/non-ref-kid` | `ParseError` | `/Kids` holds something other than a reference. |

## See also

- [`pdfPage`](./page.md) — types each leaf.
- [`pdfCatalog`](./catalog.md) — supplies `catalog.pages`.
- [`pdfDocument`](./document.md)
