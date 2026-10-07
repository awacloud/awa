---
module: pdfFontColorTagging
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfFontColorTagging

> Detection of OpenType color fonts (COLR/CPAL/sbix/SVG/CBDT) and FontDescriptor flags — ISO 32000-2 §9.8.2.

**Module** `pdfFontColorTagging` | **Source** `packages/front/office/pdf/src/extra/font-color-tagging.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

PDF has no single "is-color-font" flag. This module cross-references the FontDescriptor flags (Table 121) with an sfnt-table scan of an embedded `/FontFile3 /Subtype /OpenType` program to detect color OT tables.

## Resolve

```js
const ext = runtime.resolve('pdfFontColorTagging');
// Returns: { decodeFontDescriptorFlags, detectColorFontTables,
//   typeFontFile3OpenType, FONT_DESCRIPTOR_FLAGS, COLOR_OT_TABLES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `decodeFontDescriptorFlags` | `(int) => FlagsRecord` | Decodes each bit into a named boolean. |
| `detectColorFontTables` | `(Uint8Array) => { hasCOLR, hasSbix, hasSVG, hasCBDT, tables }` | Scans the sfnt table directory. |
| `typeFontFile3OpenType` | `(streamObj) => { subtype, length, metadata, color, raw, _extras }` | Typed wrapper around `/FontFile3`. |
| `FONT_DESCRIPTOR_FLAGS` | frozen catalog | Bit name → mask (FixedPitch, Serif, Symbolic, Script, Nonsymbolic, Italic, AllCap, SmallCap, ForceBold). |
| `COLOR_OT_TABLES` | frozen array | `['COLR','CPAL','sbix','SVG ','CBDT','CBLC']`. |

## Examples

### Detect a color font

```js
const r = ext.detectColorFontTables(fontBytes);
r.tables;      // ['COLR', 'CPAL', ...]
r.hasCOLR;     // true
```

### Decode the flags

```js
const f = ext.decodeFontDescriptorFlags(0x44);
f.symbolic;    // true
f.nonsymbolic; // false
```

### Type `/FontFile3 /Subtype /OpenType`

```js
const ff3 = ext.typeFontFile3OpenType(stream);
ff3.subtype;  // 'OpenType'
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/font-flags/bad-input` | `ParseError` | Argument is not numeric. |
| `pdf/extra/color-font/bad-input` | `ParseError` | Argument is not a Uint8Array. |
| `pdf/extra/color-font/truncated` | `ParseError` | sfnt header truncated. |
| `pdf/extra/fontfile3/not-stream` | `ParseError` | `/FontFile3` is not a stream. |
| `pdf/extra/fontfile3/no-dict` | `ParseError` | Stream has no dict. |
| `pdf/extra/fontfile3/bad-subtype` | `ParseError` | `/Subtype` is not `/OpenType`. |

## See also

- [`pdfFontEmbed`](../font/embed.md)
- [`pdfFontCidTyped`](./font-cid-typed.md)
- [Extras index](./README.md)
