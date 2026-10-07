---
module: pdfPageBoundary
category: pdf/prepress
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfPageBoundary

> Page boundary boxes — ISO 32000-2 §14.11.2.

**Module** `pdfPageBoundary` | **Source** `packages/front/office/pdf/src/prepress/pageBoundary.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Computes a page's effective boundary boxes following the §14.11.2 Table 31 inheritance rules:
- `/MediaBox` — paper size, mandatory.
- `/CropBox` — visible area, defaults to `MediaBox`.
- `/TrimBox` — finished trim area, defaults to `CropBox`.
- `/BleedBox` — bleed area, defaults to `CropBox`.
- `/ArtBox` — meaningful content area, defaults to `CropBox`.

Each box is `[llx, lly, urx, ury]`. The module accepts either an already-typed page record (with `mediaBox`/`cropBox`/… own fields) or a raw dict-shape object (`{ entries: { MediaBox, … } }` or `{ raw: { entries: {...} } }`), and validates the box shape (4 numeric elements) before returning it.

## Resolve

```js
const pb = runtime.resolve('pdfPageBoundary');
// Returns: { effectiveMediaBox, effectiveCropBox, effectiveTrimBox, effectiveBleedBox, effectiveArtBox }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `effectiveMediaBox` | `(page) => [number,number,number,number]` | Throws if absent. |
| `effectiveCropBox` | `(page) => Box` | Falls back to MediaBox. |
| `effectiveTrimBox` | `(page) => Box` | Falls back to CropBox. |
| `effectiveBleedBox` | `(page) => Box` | Falls back to CropBox. |
| `effectiveArtBox` | `(page) => Box` | Falls back to CropBox. |

`page` is the output of [`pdfPage.typePage`](../document/page.md).

## Examples

### Imposition

```js
const pb = runtime.resolve('pdfPageBoundary');
for (const page of doc.pages) {
    const trim  = pb.effectiveTrimBox(page);
    const bleed = pb.effectiveBleedBox(page);
    const margin = trim[0] - bleed[0];   // left bleed margin
}
```

### Screen rendering

```js
const view = pb.effectiveCropBox(page);
canvas.width  = view[2] - view[0];
canvas.height = view[3] - view[1];
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/page-boundary/bad-box` | `ParseError` | Box is not a 4-element array. |
| `pdf/page-boundary/bad-box-element` | `ParseError` | A box element is non-numeric. |
| `pdf/page-boundary/no-mediabox` | `ParseError` | `/MediaBox` absent along the inheritance chain. |

## See also

- [`pdfPage`](../document/page.md) · [`pdfOutputIntent`](./outputIntent.md)
