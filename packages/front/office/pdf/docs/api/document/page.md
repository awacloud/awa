---
module: pdfPage
category: pdf/document
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfPage

> Typing of a `/Type /Page` dictionary, ISO 32000-2 §7.7.3.3 — boxes, contents, rotate, annots.

**Module** `pdfPage` | **Source** `packages/front/office/pdf/src/document/page.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Normalises a Page dictionary:

- The boxes (`MediaBox`, `CropBox`, `BleedBox`, `TrimBox`, `ArtBox`) are
  flattened to `[llx, lly, urx, ury]` numeric tuples.
- `/Contents` is always exposed as `Array<{num, gen}>` (empty, single, or
  multiple).
- `/Rotate` is normalised to a multiple of 90 within `[0, 270]`; an invalid
  value becomes 0.
- `/Resources` is inheritable (§7.7.3.4) — not resolved here, kept raw.
- Unknown entries go to `_extras`.

## Resolve

```js
const page = runtime.resolve('pdfPage');
// Returns: { typePage }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typePage` | `(dict: PdfDict) => TypedPage` | Typed record. |

### `TypedPage` shape

```js
{
    parent:    { num, gen } | null,
    mediaBox:  [number, number, number, number] | null,
    cropBox?:  [number, number, number, number],
    bleedBox?, trimBox?, artBox?: same,
    resources: PdfObject | null,
    contents:  Array<{ num, gen }>,        // always an array, sometimes empty
    rotate:    number,                     // 0 | 90 | 180 | 270
    annots:    Array<PdfObject>,           // references or inline annotations
    userUnit?: number,
    tabs?:     string,
    metadata?: PdfRef,
    group?:    PdfObject,
    raw:       PdfDict,
    _extras:   Object<string, PdfObject>
}
```

## Examples

### Dimensions of the first page

```js
const doc = api.read(bytes);
const p0 = doc.pages[0];
const [llx, lly, urx, ury] = p0.mediaBox;  // e.g. [0, 0, 612, 792]
console.log('rotate=', p0.rotate);
```

### Iterating the content streams

```js
for (const ref of p0.contents) {
    const stream = doc._raw.resolve({ type: 'ref', ...ref });
    // stream.raw: Uint8Array — decode /Filter with pdfFilterDispatch
}
```

### Counting annotations

```js
doc.pages.reduce((n, p) => n + p.annots.length, 0);
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/page/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/page/bad-type` | `ParseError` | `/Type` present but not `/Page`. |

## See also

- [`pdfPages`](./pages.md) — produces the reference list typed here.
- [`pdfResources`](./resources.md) — resolves the inheritable `/Resources`.
- [`pdfDocument`](./document.md)
- [`pdfErrors`](../errors.md)
