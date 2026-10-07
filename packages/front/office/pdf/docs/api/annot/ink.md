---
module: pdfInkAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfInkAnnot

> Ink (freehand) annotation — ISO 32000-2 §12.5.6.13.

**Module** `pdfInkAnnot` | **Source** `packages/front/office/pdf/src/annot/ink.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Ink`. A freehand trace: `/InkList` is an array of strokes, each stroke
itself an array of coordinates `[x0 y0 x1 y1 …]` (pairs). `/BS` — part of the
base record — carries width and style. The typer validates the shape strictly:
an array of arrays of numeric pairs. `/InkList` is the only subtype-specific
entry; everything else lands in the base record or in `_extras`.

## Resolve

```js
const ink = runtime.resolve('pdfInkAnnot');
// Returns: { typeInkAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeInkAnnot` | `(dict) => InkAnnot` | Base record plus `inkList: number[][]`. |

Each sub-array of `inkList` is one stroke; an even length is guaranteed.

## Examples

### Reading the strokes

```js
const a = runtime.resolve('pdfInkAnnot').typeInkAnnot(dict);
for (const stroke of a.inkList) {
    for (let i = 0; i < stroke.length; i += 2) {
        const [x, y] = [stroke[i], stroke[i + 1]];
        // …
    }
}
```

### Line width

```js
a.bs?.entries.W?.value;   // line width, from the base record
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/ink/bad-subtype` | `ParseError` | `/Subtype` present and not `/Ink`. |
| `pdf/annot/ink/bad-inklist` | `ParseError` | `/InkList` is not an array. |
| `pdf/annot/ink/bad-stroke` | `ParseError` | A non-array element inside `/InkList`. |
| `pdf/annot/ink/bad-coord` | `ParseError` | Stroke of odd length, or a non-numeric element. |

## See also

- [`pdfAnnot`](./annot.md)
- [`pdfMarkupAnnot`](./markup.md) — shared markup entries land in `_extras` here too.
