---
module: pdfOutline
category: pdf/outline
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfOutline

> Document outline (bookmarks) — ISO 32000-2 §12.3.3.

**Module** `pdfOutline` | **Source** `packages/front/office/pdf/src/outline/outline.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

The outline (Catalog `/Outlines`) is a doubly-linked tree. Each item carries `/Title`, `/Parent`, `/Prev`, `/Next`, `/First`, `/Last`, `/Count` (signed — negative means collapsed), `/A` (action) or `/Dest`, `/C` (RGB colour), `/F` (style flags: 1 italic, 2 bold). `/SE` (structure element) is accepted but not decoded (kept in `_extras`). `walkOutline` walks the tree depth-first, enforcing a depth limit and detecting cycles.

**`walkOutline` returns a flat array, not a nested tree** — there is no `children` field. Each record keeps its `parent`/`prev`/`next`/`first`/`last` entries as unresolved refs (`{ type: 'ref', num, gen }`); build a tree from the flat list yourself if you need one (e.g. by indexing records by `ref.num`).

## Resolve

```js
const out = runtime.resolve('pdfOutline');
// Returns: { walkOutline, typeOutlineItem }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `walkOutline` | `(rootDict, resolveRef, opts?) => OutlineItem[]` | Flat depth-first list. |
| `typeOutlineItem` | `(dict) => OutlineItem` | Single item, refs left unresolved. |

`opts`: `{ maxDepth = 64, maxItems = 100000 }`.

### Shape `OutlineItem`

```js
{
    title: string,
    parent?, prev?, next?, first?, last?,   // { type: 'ref', num, gen } — unresolved
    count?: number,                          // signed
    action?,                                 // /A, kept raw
    dest?,                                    // /Dest, kept raw
    color?: [r, g, b],                        // /C, 3 numbers
    F?: number,                               // style flags
    ref?: { num, gen },                       // set by walkOutline only
    raw, _extras
}
```

## Examples

### Full walk (flat list)

```js
const out  = runtime.resolve('pdfOutline');
const root = doc._raw.resolve(doc.catalog.outlines);
const items = out.walkOutline(root, doc._raw.resolve);
for (const it of items) console.log(it.title);
```

### Rebuilding a tree from the flat list

```js
const byNum = new Map(items.map(it => [it.ref.num, it]));
function children(it) {
    const kids = [];
    let cur = it.first;
    while (cur) {
        const child = byNum.get(cur.num);
        if (!child) break;
        kids.push(child);
        cur = child.next;
    }
    return kids;
}
```

### Navigating from an item

```js
if (item.dest) {
    const d = runtime.resolve('pdfDestination')
        .typeDestination(item.dest, catalog.names?.entries?.Dests, resolveRef);
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/outline/not-dict` | `ParseError` | Root or resolved item is not a dict. |
| `pdf/outline/bad-first` | `ParseError` | `/First` is not a ref. |
| `pdf/outline/no-resolver` | `ParseError` | `resolveRef` not supplied. |
| `pdf/outline/max-depth` | `ParseError` | Depth exceeds `opts.maxDepth`. |
| `pdf/outline/non-ref-sibling` | `ParseError` | A sibling entry is not a ref. |
| `pdf/outline/cycle` | `ParseError` | An item was visited twice. |
| `pdf/outline/too-many` | `ParseError` | Item count exceeds `opts.maxItems`. |
| `pdf/outline/runaway` | `ParseError` | Sibling chain exceeds the item cap (infinite-loop guard). |
| `pdf/outline/item/not-dict` | `ParseError` | `typeOutlineItem` receives a non-dict. |
| `pdf/outline/missing-title` | `ParseError` | `/Title` absent. |

## See also

- [`pdfDestination`](../destination/destination.md) · [`pdfAction`](../action/action.md)
- [`pdfCatalog`](../document/catalog.md)
