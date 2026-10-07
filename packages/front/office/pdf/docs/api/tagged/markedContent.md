---
module: pdfMarkedContent
category: pdf/tagged
dependencies: [pdfErrors, pdfParser, pdfParentTree]
returns: object
worker-safe: true
status: complete
---

# pdfMarkedContent

> Marked-content sequences — ISO 32000-2 §14.6 — bridge between content streams and the struct tree.

**Module** `pdfMarkedContent` | **Source** `packages/front/office/pdf/src/tagged/markedContent.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfParentTree` | **Worker-safe** yes

The `BMC` / `BDC` / `EMC` operators (§14.6.1) delimit marked sequences in a content stream. `BDC` may carry an `MCID` in its properties dict, used as the key into the `ParentTree` (§14.7.5) to link content back to a `StructElement`. This module provides `extractMcids` (walks an ops list already typed by [`pdfContentStream`](../content/stream.md)) and `resolveMcidToStruct` (full resolution via `pdfParentTree.lookupParent`).

## Resolve

```js
const mc = runtime.resolve('pdfMarkedContent');
// Returns: { extractMcids, resolveMcidToStruct }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `extractMcids` | `(opsList) => Array<{ tag, start, end, mcid, properties }>` | Linear walk, tracks the BMC/BDC/EMC stack; `start`/`end` are inclusive op-index positions, sorted by `start`. |
| `resolveMcidToStruct` | `(pageDict, mcid, parentTree, resolveRef) => PdfObject \| null` | Lookup via `pdfParentTree.lookupParent`, indexed by the page's `/StructParents` then `mcid`. |

## Examples

### Extraction from a content stream

```js
const ops = runtime.resolve('pdfContentStream').parseContentStream(streamBytes);
const mc  = runtime.resolve('pdfMarkedContent');
const seqs = mc.extractMcids(ops);
// [{ tag: 'P', start: 3, end: 9, mcid: 0, properties: {…} }, …]
```

### Resolution to the struct elem

```js
const elemRef = mc.resolveMcidToStruct(pageDict, 0, parentTree, resolveRef);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/tagged/marked-content/bad-ops` | `ParseError` | Argument is not an array. |
| `pdf/tagged/marked-content/unmatched-emc` | `ParseError` | `EMC` without a matching `BMC`/`BDC`. |
| `pdf/tagged/marked-content/unterminated` | `ParseError` | Non-empty stack at end of stream. |
| `pdf/tagged/marked-content/bad-tag` | `ParseError` | `BMC`/`BDC` tag is not a name. |
| `pdf/tagged/marked-content/bad-page` | `ParseError` | Page argument is not a dict. |
| `pdf/tagged/marked-content/bad-entry` | `ParseError` | ParentTree entry for the page is not an array. |

## See also

- [`pdfContentStream`](../content/stream.md) · [`pdfStructTree`](./structTree.md) · [`pdfParentTree`](./parentTree.md)
