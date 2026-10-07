---
module: pdfFontCidTyped
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfFontCidTyped

> Typed CIDFont, CIDSystemInfo, `/W` glyph widths, and the predefined-CMap catalog — ISO 32000-2 §9.7.

**Module** `pdfFontCidTyped` | **Source** `packages/front/office/pdf/src/extra/font-cid-typed.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

Covers `/CIDFontType0` and `/CIDFontType2` (§9.7.4), `/CIDSystemInfo` (§9.7.3), `/CIDToGIDMap` (§9.7.4.3), `/W /W2 /DW /DW2` (§9.7.4.3), and the frozen list of predefined CMaps (§9.7.5.2).

## Resolve

```js
const ext = runtime.resolve('pdfFontCidTyped');
// Returns: { typeCIDFont, typeCIDSystemInfo, decodeWidthsW, PREDEFINED_CMAPS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeCIDFont` | `(dict) => CIDFont` | Record for `/Type /Font /Subtype /CIDFontType{0,2}`. |
| `typeCIDSystemInfo` | `(dict) => { registry, ordering, supplement }` | §9.7.3. |
| `decodeWidthsW` | `(array) => Array<{ first, last, widths? , width? }>` | Expands `/W` runs. |
| `PREDEFINED_CMAPS` | frozen catalog | Map `registry-ordering` → list of CMap names. |

## Examples

### Type a CIDFont

```js
const cid = ext.typeCIDFont(doc._raw.resolve(cidFontRef));
cid.subtype;         // 'CIDFontType2'
cid.cidSystemInfo.registry; // 'Adobe'
cid.dw;              // 1000
```

### Decode `/W`

```js
ext.decodeWidthsW(arr);
// [ { first: 1, last: 3, widths: [500, 500, 500] }, { first: 10, last: 10, width: 600 } ]
```

### Predefined CMap

```js
ext.PREDEFINED_CMAPS['Adobe-GB1'].includes('GB-EUC-H'); // true
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/cid-font/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/cid-font/bad-type` | `ParseError` | `/Type` present and not `/Font`. |
| `pdf/extra/cid-font/bad-subtype` | `ParseError` | `/Subtype` is not a CIDFontType. |
| `pdf/extra/cid-font/missing-csi` | `ParseError` | `/CIDSystemInfo` missing. |
| `pdf/extra/cid-system-info/not-dict` | `ParseError` | CIDSystemInfo is not a dictionary. |
| `pdf/extra/cid-system-info/incomplete` | `ParseError` | A required field is absent. |
| `pdf/extra/cid-font/bad-w` | `ParseError` | `/W` is not an array. |
| `pdf/extra/cid-font/bad-w-c` | `ParseError` | First value is not numeric. |
| `pdf/extra/cid-font/bad-w-item` | `ParseError` | Array item is not numeric. |
| `pdf/extra/cid-font/bad-w-range` | `ParseError` | Range form is malformed. |

## See also

- [`pdfFont`](../font/font.md)
- [`pdfFontEncoding`](../font/encoding.md)
- [Extras index](./README.md)
