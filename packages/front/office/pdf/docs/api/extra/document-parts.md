---
module: pdfDocumentParts
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfDocumentParts

> Document Parts hierarchical tree (`/DPartRoot`, `/DPart`, `/DPM`) — ISO/TS 32004.

**Module** `pdfDocumentParts` | **Source** `packages/front/office/pdf/src/extra/document-parts.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

TS 32004 introduces a "Document Parts" tree rooted in the Catalog under `/DPartRoot`. Each node is a `/Type /DPart` dict with `/Parent`, `/DParts` (child nodes or pages), `/Start`/`/End`, `/DPM` (metadata), `/NodeNameTree`.

## Resolve

```js
const ext = runtime.resolve('pdfDocumentParts');
// Returns: { typeDPartRoot, typeDPart, typeDPM, walkDParts }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeDPartRoot` | `(dict) => DPartRoot` | Root `/DPartRoot`. |
| `typeDPart` | `(dict) => DPart` | A tree node. |
| `typeDPM` | `(dict) => DPM` | Metadata dict. |
| `walkDParts` | `(root, visit) => void` | Depth-first traversal. |

## Examples

### Load the root

```js
const ext = runtime.resolve('pdfDocumentParts');
const root = ext.typeDPartRoot(doc._raw.resolve(catalog.dPartRoot));
root.rootNode; // ref
```

### Traversal

```js
ext.walkDParts(rootNode, (node) => {
    console.log(node.start, '-', node.end);
});
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/dparts/root/not-dict` | `ParseError` | Root is not a dict. |
| `pdf/extra/dparts/root/bad-type` | `ParseError` | `/Type` is not `/DPartRoot`. |
| `pdf/extra/dparts/root/missing-node` | `ParseError` | `/DPartRootNode` absent. |
| `pdf/extra/dparts/node/not-dict` | `ParseError` | Node is not a dict. |
| `pdf/extra/dparts/node/bad-type` | `ParseError` | `/Type` is not `/DPart`. |
| `pdf/extra/dparts/node/bad-dpm` | `ParseError` | `/DPM` is not a dict. |
| `pdf/extra/dparts/dpm/not-dict` | `ParseError` | DPM is not a dict. |
| `pdf/extra/dparts/walk/bad-visit` | `ParseError` | `visit` is not a function. |

## See also

- [`pdfCatalog`](../document/catalog.md)
- [`pdfXmpExtended`](./xmp-extended.md)
- [Extras index](./README.md)
