---
module: pdfProjectionAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfProjectionAnnot

> Projection annotation (3D view) — ISO 32000-2 §13.6.6.2.

**Module** `pdfProjectionAnnot` | **Source** `packages/front/office/pdf/src/annot/projection.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Projection`: an annotation bound to a 3D view. Two subtype-specific
entries are promoted — `/V` (the 3D view, a dictionary or a referenced view
name) and `/B` (the 3D state dictionary: background and so on). Everything else,
including the shared markup entries (`/T`, `/Subj`, `/CreationDate`, …) and 3D
extras such as `/M3D`, is captured into `_extras` under its raw PDF name.

The same source file also carries the legacy Movie/Sound handling (Annex H,
deprecated in PDF 2.0) for completeness.

## Resolve

```js
const proj = runtime.resolve('pdfProjectionAnnot');
// Returns: { typeProjectionAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeProjectionAnnot` | `(dict) => ProjectionAnnot` | Base record plus `v` (raw typed `/V`) and `b` (`/B` dictionary or `null`), with everything else in `_extras`. |

## Examples

```js
const p = runtime.resolve('pdfProjectionAnnot').typeProjectionAnnot(dict);
p.v;            // /V — 3D view dict or name
p.b;            // /B — 3D state dict or null
p._extras.T;    // /T (author) — typed string object
p._extras.M3D;  // reference to the 3D measurement, when present
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/projection/bad-subtype` | `ParseError` | `/Subtype` present and not `/Projection`. |

## See also

- [`pdfAnnot`](./annot.md) · [`pdfMarkupAnnot`](./markup.md)
