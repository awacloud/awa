---
module: pdfShapeAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfShapeAnnot

> Shape annotations — Line/Square/Circle/Polygon/PolyLine — ISO 32000-2 §12.5.6.7–§12.5.6.9.

**Module** `pdfShapeAnnot` | **Source** `packages/front/office/pdf/src/annot/square.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Generic typer for the geometric annotations. `/IC` (interior colour) is read for
every subtype; the remaining entries are gated on `expected`:

| `expected` | Fields set |
|------------|------------|
| `Square`, `Circle` | `ic`, `rd` (`/RD`) |
| `Line` | `ic`, `l` (`/L`), `le` (`/LE`), `ll` (`/LL`), `lle` (`/LLE`), `cap` (`/Cap`), `cp` (`/CP`), `it` (`/IT`), `measure` (`/Measure`) |
| `Polygon`, `PolyLine` | `ic`, `vertices` (`/Vertices`), `le`, `it`, `measure`, `path` (`/Path`) |

Every other entry — including `/BE`, handled by the base typer, and the shared
markup entries `/T`, `/Subj`, `/Popup`, … — is either part of the base record or
captured into `_extras`.

## Resolve

```js
const shape = runtime.resolve('pdfShapeAnnot');
// Returns: { typeShapeAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeShapeAnnot` | `(dict, expected: string) => ShapeAnnot` | Base record plus the geometry fields listed above. |

`expected` ∈ `'Line'`, `'Square'`, `'Circle'`, `'Polygon'`, `'PolyLine'`.

## Examples

### Square / Circle

```js
const s = runtime.resolve('pdfShapeAnnot').typeShapeAnnot(dict, 'Square');
s.ic;        // [r, g, b] interior colour
s.rd;        // rectangle differences
s.bs;        // border style dict (base record)
```

### Line with endings

```js
const l = runtime.resolve('pdfShapeAnnot').typeShapeAnnot(dict, 'Line');
l.l;         // [x1, y1, x2, y2]
l.le;        // ['OpenArrow', 'None']
l.cap;       // false unless /Cap true
```

### Polygon vertices

```js
const p = runtime.resolve('pdfShapeAnnot').typeShapeAnnot(dict, 'Polygon');
p.vertices;  // [x0, y0, x1, y1, …]
p.path;      // typed /Path array or null
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/shape/bad-expected` | `ParseError` | `expected` outside the allowed set. |
| `pdf/annot/shape/bad-subtype` | `ParseError` | `/Subtype` differs from `expected`. |
| `pdf/annot/shape/bad-ic` | `ParseError` | `/IC` is not an array of numbers. |
| `pdf/annot/shape/bad-rd` | `ParseError` | `/RD` is not an array of numbers. |
| `pdf/annot/shape/bad-l` | `ParseError` | `/L` is not an array of numbers. |
| `pdf/annot/shape/bad-le` | `ParseError` | `/LE` is not an array of names. |
| `pdf/annot/shape/bad-vertices` | `ParseError` | `/Vertices` is not an array of numbers. |

## See also

- [`pdfAnnot`](./annot.md) — dispatcher.
- [`pdfMarkupAnnot`](./markup.md) — text-markup subtypes.
