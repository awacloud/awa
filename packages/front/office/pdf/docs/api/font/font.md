---
module: pdfFont
category: pdf/font
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfFont

> Typing of a PDF Font dict — ISO 32000-2 §9.6 / §9.7.

**Module** `pdfFont` | **Source** `packages/front/office/pdf/src/font/font.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

This module **does not parse font files** — all PFB/PFA, TrueType/OpenType, CFF, CIDFont byte reading is delegated to `@awacloud/fonts`. Here we only type the Font **dictionary** (Type, Subtype, BaseFont, Encoding, FirstChar, LastChar, Widths, FontDescriptor, ToUnicode, DescendantFonts) and classify the font among `Type0`, `Type1`, `MMType1`, `Type3`, `TrueType`, `CIDFontType0`, `CIDFontType2`. A Standard 14 fallback is available if the caller supplies `opts.standard14` (`isStandard14` / `lookupStandard14` lookup).

## Resolve

```js
const f = runtime.resolve('pdfFont');
// Returns: { typeFont, resolveDescendant }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeFont` | `(dict, opts?: { standard14 }) => Font` | Typing. |
| `resolveDescendant` | `(type0Font, resolveRef) => Font \| null` | Reads the descendant CIDFont of a Type0. |

### Shape `Font`

```js
{
    subtype: 'Type0'|'Type1'|'MMType1'|'Type3'|'TrueType'|'CIDFontType0'|'CIDFontType2',
    baseFont:        string | null,
    encoding:        PdfObject | null,    // name | dict
    firstChar:       int | null,
    lastChar:        int | null,
    widths:          number[] | null,
    fontDescriptor:  PdfObject | null,
    toUnicode:       PdfObject | null,
    descendantFonts: PdfObject[] | null,
    standard14:      object | null,       // set when the fallback triggers
    raw:             object
}
```

The Standard 14 fallback triggers only when: `subtype ∈ {Type1, MMType1}`, **no** `/FontDescriptor`, and `baseFont` is recognized by `isStandard14`.

## Examples

### Simple typing

```js
const f = runtime.resolve('pdfFont');
const font = f.typeFont(resources.Font.F1);
font.subtype;   // 'Type1'
font.baseFont;  // 'Helvetica'
```

### Composite Type0 + descendant

```js
const type0 = f.typeFont(resources.Font.F1);
if (type0.subtype === 'Type0') {
    const cid = f.resolveDescendant(type0, doc._raw.resolve);
    cid.subtype;  // 'CIDFontType2'
}
```

### Standard 14 fallback

```js
const font = f.typeFont(dict, {
    standard14: runtime.resolve('fontsStandard14')
});
font.standard14;  // { widths, bbox, italicAngle, ... } | null
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/font/not-dict` | `ParseError` | Argument is not a typed dict. |
| `pdf/font/bad-type` | `ParseError` | `/Type` present but ≠ `/Font`. |
| `pdf/font/missing-subtype` | `ParseError` | `/Subtype` absent or not a name. |
| `pdf/font/unknown-subtype` | `ParseError` | `/Subtype` outside the 7 known values. |

## See also

- [`pdfFontEncoding`](./encoding.md) — `/Encoding` resolution.
- [`pdfType3`](./type3.md) — Type 3 font (PDF-specific).
- [`pdfFontEmbed`](./embed.md) — write-side adapter.
- [`pdfText`](../content/text.md) — consumes `subtype` for `extractText`.
- [`pdfResources`](../document/resources.md) — supplies the dicts.
