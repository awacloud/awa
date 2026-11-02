---
module: pdfFontColorTagging
category: pdf/extra
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfFontColorTagging

> Detection of OpenType color fonts (COLR/CPAL/sbix/SVG/CBDT), FontDescriptor flags and the typed font descriptor — ISO 32000-2 §9.8.

**Module** `pdfFontColorTagging` | **Source** `packages/front/office/pdf/src/extra/font-color-tagging.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

PDF has no single "is-color-font" flag. This module cross-references the FontDescriptor flags (Table 121) with an sfnt-table scan of an embedded `/FontFile3 /Subtype /OpenType` program to detect color OT tables. It also types the font descriptor itself (Tables 120, 122 and 123), which the core font typers return untyped as `fontDescriptor`.

## Resolve

```js
const ext = runtime.resolve('pdfFontColorTagging');
// Returns: { decodeFontDescriptorFlags, detectColorFontTables,
//   typeFontFile3OpenType, typeFontFileEntries, typeFontDescriptor, FONT_DESCRIPTOR_FLAGS,
//   COLOR_OT_TABLES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `decodeFontDescriptorFlags` | `(int) => FlagsRecord` | Decodes each bit into a named boolean. |
| `detectColorFontTables` | `(Uint8Array) => { hasCOLR, hasSbix, hasSVG, hasCBDT, tables }` | Scans the sfnt table directory. |
| `typeFontFile3OpenType` | `(streamObj) => { subtype, length, metadata, color, filter?, decodeParms?, raw, _extras }` | Typed wrapper around `/FontFile3`; `length` is the byte count of the stream, `filter` (a name, or the array as read) and `decodeParms` (as read) only when present; `length1`, `length2`, `length3` (integers) only when present. |
| `typeFontFileEntries` | `(streamObj) => { length1?, length2?, length3?, subtype?, metadata?, raw }` | The companion of `typeStreamEntries` for a font file stream (`/FontFile`, `/FontFile2`, `/FontFile3`): its own keys, present only when the key is (`null` for a value of another type); no `_extras`. Throws `pdf/extra/fontfile/not-stream` for a non-stream. |
| `typeFontDescriptor` | `(dict) => FontDescriptorRecord` | Typed font descriptor of any font kind — simple, Type 3, CIDFont, or a value of a CIDFont descriptor's `/FD` (shape below). |
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

### Type a font descriptor

```js
const { obj } = runtime.resolve('pdfParserObj');
const fd = ext.typeFontDescriptor(obj.dict({
    Type: obj.name('FontDescriptor'), FontName: obj.name('Helvetica'),
    Flags: obj.int(32), FontBBox: obj.array([-166, -225, 1000, 931].map(obj.int)),
    ItalicAngle: obj.int(0), Ascent: obj.int(718), Descent: obj.int(-207),
    StemV: obj.int(88), FontFile2: obj.ref(12, 0)
}));
fd.fontName;      // 'Helvetica'
fd.fontBBox;      // [-166, -225, 1000, 931]
fd.missingWidth;  // 0 (the Table 120 default)
fd.fontFile2;     // { num: 12, gen: 0 }
ext.decodeFontDescriptorFlags(fd.flags).nonsymbolic; // true
```

`FontDescriptorRecord`:

| Field | Entry | Value |
|---|---|---|
| `type`, `fontName`, `fontStretch`, `lang` | `/Type`, `/FontName`, `/FontStretch`, `/Lang` | the name value, else `null` |
| `fontFamily`, `charSet` | `/FontFamily`, `/CharSet` | the string value (bytes), else `null` |
| `fontWeight`, `flags` | `/FontWeight`, `/Flags` | an integer, else `null` |
| `fontBBox` | `/FontBBox` | `[llx, lly, urx, ury]` from a four-number array, else `null` |
| `italicAngle`, `ascent`, `descent`, `capHeight`, `stemV` | the same entries | a number, else `null` |
| `leading`, `xHeight`, `stemH`, `avgWidth`, `maxWidth`, `missingWidth` | the same entries | a number, else `0` (the Table 120 default) |
| `fontFile`, `fontFile2`, `fontFile3`, `cidSet` | `/FontFile`, `/FontFile2`, `/FontFile3`, `/CIDSet` | `{ num, gen }` for a reference (the form the standard requires), the stream as read when direct, else `null` |
| `style`, `fd` | `/Style`, `/FD` (CIDFonts, Table 123) | the dictionary as read, `{ num, gen }` for a reference, else `null` |
| `_extras` | every other entry | as read |

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/font-flags/bad-input` | `ParseError` | Argument is not numeric. |
| `pdf/extra/color-font/bad-input` | `ParseError` | Argument is not a Uint8Array. |
| `pdf/extra/color-font/truncated` | `ParseError` | sfnt header truncated. |
| `pdf/extra/fontfile3/not-stream` | `ParseError` | `/FontFile3` is not a stream. |
| `pdf/extra/fontfile3/no-dict` | `ParseError` | Stream has no dict. |
| `pdf/extra/fontfile3/bad-subtype` | `ParseError` | `/Subtype` is not `/OpenType`. |
| `pdf/extra/font-descriptor/not-dict` | `ParseError` | `typeFontDescriptor` argument is not a dictionary. |

## See also

- [`pdfFontEmbed`](../font/embed.md)
- [`pdfFontCidTyped`](./font-cid-typed.md)
- [Extras index](./README.md)
