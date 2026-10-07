---
module: pdfMarkupAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfMarkupAnnot

> Text-markup annotations — ISO 32000-2 §12.5.6.10.

**Module** `pdfMarkupAnnot` | **Source** `packages/front/office/pdf/src/annot/markup.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Covers the `Highlight`, `Underline`, `Squiggly`, `StrikeOut` and `Caret`
subtypes. The typer consumes `/QuadPoints` (8 × n floats — the four corners of
each region), `/IT` (intent) and, for `Caret` only (§12.5.6.11), `/RD`
(rectangle differences) and `/Sy` (displayed symbol).

The shared markup entries of §12.5.6.2 — `/T` (author), `/Subj`, `/RC` (rich
content), `/CreationDate`, `/IRT` (in-reply-to ref), `/RT` (reply type), `/Popup`
and `/ExData` — are **not** promoted to named fields: they are neither base keys
nor subtype keys, so `captureExtras` puts them in `_extras` under their raw PDF
names.

## Resolve

```js
const markup = runtime.resolve('pdfMarkupAnnot');
// Returns: { typeMarkupAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeMarkupAnnot` | `(dict, expected: string) => MarkupAnnot` | Base record plus `quadPoints`, `it`, and — for `Caret` — `rd` and `sy`. |

`expected` ∈ `'Highlight'`, `'Underline'`, `'Squiggly'`, `'StrikeOut'`,
`'Caret'`. The multiple-of-8 check on `/QuadPoints` is applied to every subtype
except `Caret`.

## Examples

### Typed highlight

```js
const m = runtime.resolve('pdfMarkupAnnot').typeMarkupAnnot(dict, 'Highlight');
m.quadPoints;      // number[8 * n]
m.it;              // /IT intent name or null
m._extras.T;       // /T (author) — typed string object
m._extras.Popup;   // /Popup — typed ref object
```

### Reply thread

```js
m._extras.IRT;     // ref to the parent annotation
m._extras.RT;      // 'R' (reply) | 'Group' — typed name object
```

### Caret specifics

```js
const c = runtime.resolve('pdfMarkupAnnot').typeMarkupAnnot(dict, 'Caret');
c.rd;              // rectangle differences
c.sy;              // 'P' | 'None' | null
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/markup/bad-expected` | `ParseError` | `expected` is not one of the five supported subtypes. |
| `pdf/annot/markup/bad-subtype` | `ParseError` | `/Subtype` differs from `expected`. |
| `pdf/annot/markup/bad-quadpoints` | `ParseError` | `/QuadPoints` is not an array of numbers, or its length is not a multiple of 8. |
| `pdf/annot/markup/bad-rd` | `ParseError` | `/RD` (Caret) is not an array of numbers. |

## See also

- [`pdfAnnot`](./annot.md)
- [`pdfPopupAnnot`](./popup.md)
