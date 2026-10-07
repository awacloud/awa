---
module: pdfType3
category: pdf/font
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfType3

> Typing of a Type 3 font (glyphs defined by content streams) — ISO 32000-2 §9.6.4.

**Module** `pdfType3` | **Source** `packages/front/office/pdf/src/font/type3.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Unlike Type1/TrueType/CIDFont (which delegate to `@awacloud/fonts`), Type 3 fonts are **PDF-specific**: each glyph is defined by a content stream in `/CharProcs`. That is why this module lives here rather than in `@awacloud/fonts`. The exposed record carries `bbox`, `matrix` (defaults to `[0.001, 0, 0, 0.001, 0, 0]`), `charProcs`, `encoding`, `firstChar`/`lastChar`/`widths`, `fontDescriptor` (optional in PDF 2.0), and `resources` (local to the glyphs).

## Resolve

```js
const t3 = runtime.resolve('pdfType3');
// Returns: { typeType3 }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeType3` | `(dict) => Type3Font` | Typing. |

### Shape `Type3Font`

```js
{
    subtype: 'Type3',
    bbox:   [llx,lly,urx,ury] | null,
    matrix: [0.001,0,0,0.001,0,0],   // default
    charProcs:      { [glyphName]: PdfObject },   // stream | ref
    encoding:       PdfObject | null,
    firstChar:      int | null,
    lastChar:       int | null,
    widths:         number[] | null,
    fontDescriptor: PdfObject | null,
    resources:      PdfObject | null,
    raw:            object
}
```

## Examples

### Typing

```js
const t3 = runtime.resolve('pdfType3');
const font = t3.typeType3(resources.Font.F1);
font.subtype;     // 'Type3'
font.bbox;        // [0, 0, 1000, 1000]
font.matrix;      // [0.001, 0, 0, 0.001, 0, 0]
```

### Rendering a glyph stream

```js
const procRef = font.charProcs.a;     // ref to a content stream
const proc = doc._raw.resolve(procRef);
const ops = runtime.resolve('pdfContentStream').parseContentStream(proc.raw);
// The first op is usually d0 or d1 (set glyph metrics)
```

### Encoding via the dedicated module

```js
const enc = runtime.resolve('pdfFontEncoding');
const table = enc.resolveEncoding(font.encoding, lookupNamed);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/type3/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/type3/wrong-subtype` | `ParseError` | `/Subtype` absent, not a name, or ≠ `/Type3`. |

## See also

- [`pdfFont`](./font.md) — generic typing (other subtypes).
- [`pdfFontEncoding`](./encoding.md) — `/Encoding` resolution.
- [`pdfContentStream`](../content/stream.md) — parses `CharProcs`.
- [`pdfContentOps`](../content/ops.md) — `d0` / `d1` Type3 ops.
