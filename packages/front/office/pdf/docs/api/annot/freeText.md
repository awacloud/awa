---
module: pdfFreeTextAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfFreeTextAnnot

> Free text annotation — ISO 32000-2 §12.5.6.6.

**Module** `pdfFreeTextAnnot` | **Source** `packages/front/office/pdf/src/annot/freeText.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/FreeText` — text painted directly on the page rather than in a pop-up.
Subtype-specific entries: `/DA` (default appearance string — a sequence of `Tf`,
`g`, `rg`, … operators), `/Q` (quadding 0/1/2), `/RC` (rich content), `/DS`
(default style, CSS), `/CL` (callout line array), `/IT` (intent: `FreeText`,
`FreeTextCallout`, `FreeTextTypeWriter`), `/RD` (rectangle differences) and
`/LE` (line ending). `/BS` and `/BE` come from the base record.

## Resolve

```js
const ft = runtime.resolve('pdfFreeTextAnnot');
// Returns: { typeFreeTextAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeFreeTextAnnot` | `(dict) => FreeTextAnnot` | Base record plus `da`, `q`, `rc`, `ds`, `cl`, `it`, `rd`, `le`. |

`da`, `rc` and `ds` are the raw `Uint8Array` payloads of the PDF strings; `le` is
a single name (not an array).

## Examples

### Plain free text

```js
const f = runtime.resolve('pdfFreeTextAnnot').typeFreeTextAnnot(dict);
f.contents;    // body text
f.da;          // Uint8Array — Tf + rg/g sequence
f.q;           // 0=left, 1=center, 2=right
```

### Callout

```js
f.it === 'FreeTextCallout';
f.cl;          // [x1, y1, x2, y2, x3, y3] — knee/elbow points
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/freetext/bad-subtype` | `ParseError` | `/Subtype` present and not `/FreeText`. |
| `pdf/annot/freetext/bad-cl` | `ParseError` | `/CL` is not an array of numbers. |
| `pdf/annot/freetext/bad-rd` | `ParseError` | `/RD` is not an array of numbers. |

## See also

- [`pdfAnnot`](./annot.md)
- [`pdfAppearance`](../form/appearance.md) — `/AP` shares the same mechanics.
