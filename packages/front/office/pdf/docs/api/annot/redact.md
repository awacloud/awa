---
module: pdfRedactAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfRedactAnnot

> Redact annotation (ISO 32000-2 §12.5.6.21) — read-side typing only; applying a redaction (content removal) is not implemented.

**Module** `pdfRedactAnnot` | **Source** `packages/front/office/pdf/src/annot/redact.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Redact`: a visual marker for an area to be redacted. Actually applying
the redaction (removing the underlying content) is *not* performed by this
module. Subtype-specific entries: `/QuadPoints` (regions, multiples of 8
floats), `/IC` (interior colour after redaction), `/RO` (override appearance),
`/OverlayText` (replacement text), `/Repeat` (boolean — repeat the overlay
pattern), `/DA` and `/Q`.

## Resolve

```js
const redact = runtime.resolve('pdfRedactAnnot');
// Returns: { typeRedactAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeRedactAnnot` | `(dict) => RedactAnnot` | Base record plus `quadPoints`, `ic`, `ro`, `overlayText`, `repeat`, `da`, `q`. |

`overlayText` and `da` are the raw `Uint8Array` payloads of the PDF strings;
`q` defaults to `0` and `repeat` to `false`.

## Examples

### Marking

```js
const r = runtime.resolve('pdfRedactAnnot').typeRedactAnnot(dict);
r.quadPoints;    // regions to redact
r.overlayText;   // Uint8Array — e.g. 'REDACTED'
r.ic;            // [0, 0, 0] = solid black
```

### Applying

Application must happen out of band (content removal, image re-encoding,
deletion of covered annotations). See
[`pdfRedactionIso32005`](../extra/redaction-iso32005.md).

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/redact/bad-subtype` | `ParseError` | `/Subtype` present and not `/Redact`. |
| `pdf/annot/redact/bad-quadpoints` | `ParseError` | `/QuadPoints` is not an array of numbers, or its length is not a multiple of 8. |
| `pdf/annot/redact/bad-ic` | `ParseError` | `/IC` is not an array of numbers. |

## See also

- [`pdfAnnot`](./annot.md) · [`pdfMarkupAnnot`](./markup.md)
- [`pdfRedactionIso32005`](../extra/redaction-iso32005.md)
