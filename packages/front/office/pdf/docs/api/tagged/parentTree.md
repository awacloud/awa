---
module: pdfParentTree
category: pdf/tagged
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfParentTree

> ParentTree — ISO 32000-2 §14.7.5 — number tree, MCID → struct element / OBJR.

**Module** `pdfParentTree` | **Source** `packages/front/office/pdf/src/tagged/parentTree.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

The StructTreeRoot's `/ParentTree` is a *number tree* (§7.9.7) mapping `StructParents`/`StructParent` keys (on pages, annotations, content-stream objects) to their parent structure elements. The module provides `lookupParent(tree, key, resolveRef, opts?)`, which descends `/Kids` nodes (checking `/Limits`) then scans `/Nums` leaves until `key` is found. Returns either a single ref (annotations/form XObjects) or an array indexed by MCID (pages).

## Resolve

```js
const pt = runtime.resolve('pdfParentTree');
// Returns: { lookupParent }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `lookupParent` | `(tree, key: number, resolveRef, opts?: { maxDepth? }) => PdfObject \| null` | Value of the number tree for `key`. |

`opts.maxDepth` defaults to `32`. Returns `null` when `key` is not found.

## Examples

### Finding the struct elem of an MCID on a page

```js
const pt = runtime.resolve('pdfParentTree');
const page = doc.pages[0];
const parents = pt.lookupParent(structRoot.parentTree, page.structParents, resolveRef);
// parents is an array PdfObject: parents.items[mcid] -> ref to the StructElement
const elemRef = parents.items[42];
```

### Parent of an annotation

```js
const annotParent = pt.lookupParent(parentTree, annot.structParent, resolveRef);
// direct ref to the StructElement
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/tagged/parent-tree/max-depth` | `ParseError` | Depth exceeds `opts.maxDepth`. |
| `pdf/tagged/parent-tree/not-dict` | `ParseError` | Node is not a dict. |
| `pdf/tagged/parent-tree/non-ref-kid` | `ParseError` | `/Kids` contains a non-ref entry. |
| `pdf/tagged/parent-tree/bad-child` | `ParseError` | Resolved child is not a dict. |
| `pdf/tagged/parent-tree/empty-node` | `ParseError` | Node has neither `/Kids` nor `/Nums`. |
| `pdf/tagged/parent-tree/bad-nums` | `ParseError` | `/Nums` is not an even-length array. |
| `pdf/tagged/parent-tree/bad-key` | `ParseError` | `/Nums` key is not a number. |
| `pdf/tagged/parent-tree/bad-limits` | `ParseError` | `/Limits` malformed. |

## See also

- [`pdfStructTree`](./structTree.md) · [`pdfStructElement`](./structElement.md) · [`pdfMarkedContent`](./markedContent.md)
