---
module: pdfFontDecoder
category: pdf/extra
dependencies: [pdfFont, pdfFontEncoding, pdfFilterDispatch, cmapToUnicode, encodingLookup, encodingAgl, standard14Lookup, fontType1, fontCffProgram, fontSfnt]
returns: object
worker-safe: true
status: complete
---

# pdfFontDecoder

> Per-font character decoder (an opt-in extra) — code → Unicode text, and code → glyph width.

**Module** `pdfFontDecoder` (`pdfFontDecoder`) | **Source** `packages/front/office/pdf/src/extra/font-decoder.js` | **Deps** `pdfFont`, `pdfFontEncoding`, `pdfFilterDispatch`, `cmapToUnicode`, `encodingLookup`, `encodingAgl`, `standard14Lookup`, `fontType1`, `fontCffProgram`, `fontSfnt` | **Worker-safe** yes

Turns a PDF Font dict into a decoder honouring these decode paths in priority order: a `/ToUnicode` CMap (authoritative), then an `/Encoding` table + the AGL glyph-name hop for simple fonts, then — for composite (`Type0`) fonts only — the predefined CMap the `/Encoding` names, when that CMap's input codes are Unicode. The same decoder also gives each code's glyph width, which a page walk uses to place the end of every text piece. It was moved from `@awacloud/oconv`'s pdf reader, which is now built on it (and on [`pdfPageText`](./page-text.md)); oconv keeps no copy.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras } from '@awacloud/pdf';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(pkg_require);
runtime.registerAll(modules);
runtime.registerAll(extras);
const { buildDecoder, decodeShow } = runtime.resolve('pdfFontDecoder');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `buildDecoder` | `(fontDict: object, resolve: (ref) => object) => {subtype, cidBytes, decode, split, width, vertical, widthApproximated, bold}` | a decoder bound to one resolved Font dict; `decode(code: number) => string\|null`; `split(bytes: Uint8Array) => [code, length][]` (a show string's codes); `width(code: number, length?: number) => number` (glyph width w0, thousandths of text space); `vertical` (`true` for a `…-V` composite CMap); `widthApproximated() => boolean` | — |
| `decodeShow` | `(decoder: {cidBytes, decode, split?}, strBytes: Uint8Array) => {text, decoded, undecodable}` | splits `strBytes` by `decoder.split` (else into 1- or 2-byte codes per `decoder.cidBytes`) and decodes each | — |

## Examples

### Decode a show-operator string through a ToUnicode CMap

```js
const pdfParserObj = runtime.resolve('pdfParser').obj;
const cmapToUnicode = runtime.resolve('cmapToUnicode');
const enc = (s) => new TextEncoder().encode(s);

const toUniSrc = cmapToUnicode.buildToUnicode(new Map([[0x41, 'A'], [0x42, 'B']]));
const fontDict = pdfParserObj.dict({
    Type: pdfParserObj.name('Font'), Subtype: pdfParserObj.name('Type1'),
    BaseFont: pdfParserObj.name('Helvetica'),
    ToUnicode: pdfParserObj.stream(pdfParserObj.dict({}), enc(toUniSrc))
});

const decoder = buildDecoder(fontDict, (ref) => ref);
decodeShow(decoder, new Uint8Array([0x41, 0x42]));
// { text: 'AB', decoded: 2, undecodable: 0 }
```

## Notes

- Decode priority: `/ToUnicode` first; when absent (or it has no entry for a code), the `/Encoding` table + `encodingAgl.glyphNameToUnicode` hop is tried for simple (non-`Type0`) fonts only.
- Symbol and Wingdings private-use text: a ToUnicode entry that is one character in 0xF020–0xF0FF, for a font whose family (base name less a subset tag and a `-` or `,` suffix) is `Symbol` or `SymbolMT`, decodes as the code (less 0xF000) read through `SymbolEncoding` and the AGL (U+F0B7 → `•`); for `Wingdings`, the two pairs Word itself writes are read (U+F0A7 → U+25AA `▪`, U+F0FC → U+2713 `✓`). Any other code, family or entry keeps its ToUnicode text.
- A simple font's `/Encoding` is resolved before it is read: the entry itself may be an indirect reference (pdfLaTeX writes `/Encoding n 0 R` on every Type 1 font), and so may the `/Differences` and `/BaseEncoding` inside an encoding dictionary. Such a font decodes like one with a direct `/Encoding`; it is not recorded as `text/font-unresolved`.
- A simple font's implicit base encoding (no `/Encoding`, or an encoding dictionary without `/BaseEncoding`) is `StandardEncoding`, except for a symbolic `Type1` or `MMType1` font (`/Flags` bit 3) that embeds its program: `/FontFile` (Type 1, read by `fontType1` with `/Length1` and `/Length2`), `/FontFile3` `Type1C`, or `/FontFile3` `OpenType` with a `CFF ` table (read by `fontCffProgram`). For such a font the base is the program's built-in encoding (ISO 32000-2 §9.6.6.1, Table 112), and `/Differences` apply over it. This covers pdfLaTeX's Computer Modern fonts, which carry no `/Encoding` and no `/ToUnicode`. The program is read once per stream object. A program that does not read, a CID-keyed CFF, a nonsymbolic font, and a TrueType font keep `StandardEncoding`.
- A `Symbol` or `ZapfDingbats` `Type1` font drawn without an embedded program (no `/FontFile`, `/FontFile2` or `/FontFile3`) and with no base in `/Encoding` takes its built-in encoding as the base, `SymbolEncoding` or `ZapfDingbatsEncoding` (ISO 32000-2 §9.6.2.2), `/Differences` over it.
- A font whose family (its base name less a subset tag and a `-` or `,` suffix) names Dingbats resolves the glyph names of its encoding through `encodingAgl.dingbatsNameToUnicode`: the ITC Zapf Dingbats Glyph List (`a73` → U+25A0), then the AGL. Every other font reads names through `glyphNameToUnicode` only, since other fonts use `aNN` names for unrelated glyphs.
- Standard CMap: a `Type0` font whose `/Encoding` names a `Uni{GB,CNS,JIS,KS}-{UCS2,UTF16}[-HW]-{H,V}` predefined CMap (ISO 32000-2 §9.7.5.2) decodes a code without a ToUnicode entry as the UTF-16 code unit it is; a surrogate half is counted undecodable. `Identity-H`/`Identity-V` (codes are CIDs, not Unicode) and the legacy RKSJ/EUC/… CMaps (tables not bundled) decode nothing here — a composite font in that position with no ToUnicode stays an honest `text/undecodable` loss (CID→GID→Unicode font-program walking is out of tier-1 scope).
- A code neither path resolves is counted **undecodable** and omitted from the text — never silently kept as a wrong glyph, never dropped without a count (`decodeShow`'s own return shape).
- Glyph widths (`width`), by font kind:
  - simple fonts: `/Widths` indexed from `/FirstChar`. A code outside the array takes the descriptor's `/MissingWidth` (0 when absent, the spec default). A Type 3 font's widths are scaled by its `/FontMatrix`.
  - composite (`Type0`) fonts: the descendant CIDFont's `/W` array, in both forms (`c [w1 w2 …]` and `cFirst cLast w`), with `/DW` (default 1000) for CIDs it does not list, at each code's CID: the code itself under `Identity-H`/`Identity-V`; under an embedded CMap stream, its mapping through `@awacloud/fonts`' `cmapCid`, its `/UseCMap` parent under it (a stream, or an Identity CMap by name), a code it maps to none showing CID 0 (ISO 32000-2 §9.7.6.3); the writing mode from the CMap's `/WMode`. Under a predefined CMap by another name (none is bundled) the code → CID map is unknown here, so `/DW` is used.
  - Standard 14 fonts with no `/Widths`: the Adobe Core 14 AFM widths shipped by `@awacloud/fonts` (`standard14Lookup`), looked up by the glyph name the font's encoding gives the code. `Symbol` and `ZapfDingbats` are looked up by code.
- `bold` is true when the font's `BaseFont` (a Type 0 font's descendant's too), its subset tag `ABCDEF+` removed, names a bold weight (`Bold`, `Black`, `Heavy`, `Semibold`, `Demibold`, `Demi`, `Extrabold`, `Ultrabold`, any case, or ends with URW's suffix `-Medi` or `-MediItal`, its Nimbus Roman No9 L bold), or its font descriptor has `/FontWeight` 600 or more or the ForceBold flag (`/Flags` bit 19); `oconvPdfToIr`'s opt-in heading inference reads it.
- When a width cannot be read from the font, a declared fallback is used: 500 thousandths for a simple font, 1000 for a composite one. `widthApproximated()` then turns `true`, and a page walk ([`pdfPageText`](./page-text.md)) records `text/width-approximated`. The cases are: `/Widths` absent on a font that is not one of the Standard 14, a malformed width array or entry, a missing descendant font, a `/W` table under a predefined CMap other than `Identity-H`/`Identity-V`, and a named Standard 14 glyph missing from the AFM table. A malformed width structure never throws.
- `cidBytes` is `2` for `Type0` fonts, `1` otherwise. `split` reads a show string's codes: by a composite font's embedded CMap codespace when its codes are not all 2 bytes long (ISO 32000-2 §9.7.6.2: the shortest length at which every byte lies within a range's bytes; with no match, the shortest range's length), else `cidBytes` at a time. `decodeShow` and [`pdfPageText`](./page-text.md) split by it; `Tw` applies to a 1-byte code 32.

## See also

- [`pdfPageText`](./page-text.md) — the page walk built on this decoder
- [Extras index](./README.md)
