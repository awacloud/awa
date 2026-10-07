---
module: pdfPopupAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfPopupAnnot

> Pop-up annotation — ISO 32000-2 §12.5.6.14.

**Module** `pdfPopupAnnot` | **Source** `packages/front/office/pdf/src/annot/popup.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Popup`: the display window attached to a parent annotation (markup,
sticky note). Subtype-specific entries: `/Parent` (reference to the carrying
annotation) and `/Open` (initial state). A pop-up is never meaningful alone — it
relies on its parent for `/Contents`, `/T` and `/M`.

## Resolve

```js
const popup = runtime.resolve('pdfPopupAnnot');
// Returns: { typePopupAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typePopupAnnot` | `(dict) => PopupAnnot` | Base record plus `parent: {num,gen}\|null` and `open: boolean`. |

## Examples

```js
const p = runtime.resolve('pdfPopupAnnot').typePopupAnnot(dict);
p.parent;     // reference to the parent markup annotation
p.open;       // false by default
p.rect;       // window position (base record)
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/popup/bad-subtype` | `ParseError` | `/Subtype` present and not `/Popup`. |

## See also

- [`pdfAnnot`](./annot.md) · [`pdfMarkupAnnot`](./markup.md)
- [`pdfTextAnnot`](./text.md)
