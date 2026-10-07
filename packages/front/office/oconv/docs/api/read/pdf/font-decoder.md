---
module: oconvPdfFontDecoder
category: oconv/read/pdf
dependencies: [pdfFont, pdfFontEncoding, pdfFilterDispatch, cmapToUnicode, encodingLookup, encodingAgl, standard14Lookup]
returns: object
worker-safe: true
status: complete
---

# oconvPdfFontDecoder

> Per-font character decoder for the tier-1 pdf reader — code → Unicode text, and code → glyph width.

**Module** `oconvPdfFontDecoder` (`oconvPdfFontDecoder`) | **Source** `packages/front/office/oconv/src/read/pdf/font-decoder.js` | **Deps** `pdfFont`, `pdfFontEncoding`, `pdfFilterDispatch`, `cmapToUnicode`, `encodingLookup`, `encodingAgl`, `standard14Lookup` | **Worker-safe** yes

Turns a PDF Font dict into a decoder honouring the tier-1 decode paths in priority order: a `/ToUnicode` CMap (authoritative), then an `/Encoding` table + the AGL glyph-name hop for simple fonts, then — for composite (`Type0`) fonts only — the predefined CMap the `/Encoding` names, when that CMap's input codes are Unicode. The same decoder also gives each code's glyph width, which `oconvPdfTextExtract` uses to place the end of every text piece. Composes only documented public exports of `@awacloud/pdf` and `@awacloud/fonts` — no internal reach.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { buildDecoder, decodeShow } = runtime.resolve('oconvPdfFontDecoder');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `buildDecoder` | `(fontDict: object, resolve: (ref) => object) => {subtype, cidBytes, decode, width, vertical, widthApproximated}` | a decoder bound to one resolved Font dict; `decode(code: number) => string\|null`; `width(code: number) => number` (glyph width w0, thousandths of text space); `vertical` (`true` for a `…-V` composite CMap); `widthApproximated() => boolean` | — |
| `decodeShow` | `(decoder: {cidBytes, decode}, strBytes: Uint8Array) => {text, decoded, undecodable}` | splits `strBytes` into 1- or 2-byte codes per `decoder.cidBytes` and decodes each | — |

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
- Standard CMap: a `Type0` font whose `/Encoding` names a `Uni{GB,CNS,JIS,KS}-{UCS2,UTF16}[-HW]-{H,V}` predefined CMap (ISO 32000-2 §9.7.5.2) decodes a code without a ToUnicode entry as the UTF-16 code unit it is; a surrogate half is counted undecodable. `Identity-H`/`Identity-V` (codes are CIDs, not Unicode) and the legacy RKSJ/EUC/… CMaps (tables not bundled) decode nothing here — a composite font in that position with no ToUnicode stays an honest `text/undecodable` loss (CID→GID→Unicode font-program walking is out of tier-1 scope).
- A code neither path resolves is counted **undecodable** and omitted from the text — never silently kept as a wrong glyph, never dropped without a count (`decodeShow`'s own return shape).
- Glyph widths (`width`), by font kind:
  - simple fonts: `/Widths` indexed from `/FirstChar`. A code outside the array takes the descriptor's `/MissingWidth` (0 when absent, the spec default). A Type 3 font's widths are scaled by its `/FontMatrix`.
  - composite (`Type0`) fonts: the descendant CIDFont's `/W` array, in both forms (`c [w1 w2 …]` and `cFirst cLast w`), with `/DW` (default 1000) for CIDs it does not list. Codes are read as CIDs only under `Identity-H`/`Identity-V`. Under any other CMap the code → CID map is unknown here, so `/DW` is used.
  - Standard 14 fonts with no `/Widths`: the Adobe Core 14 AFM widths shipped by `@awacloud/fonts` (`standard14Lookup`), looked up by the glyph name the font's encoding gives the code. `Symbol` and `ZapfDingbats` are looked up by code.
- When a width cannot be read from the font, a declared fallback is used: 500 thousandths for a simple font, 1000 for a composite one. `widthApproximated()` then turns `true`, and `oconvPdfTextExtract` records `text/width-approximated`. The cases are: `/Widths` absent on a font that is not one of the Standard 14, a malformed width array or entry, a missing descendant font, a `/W` table under a non-identity CMap, and a named Standard 14 glyph missing from the AFM table. A malformed width structure never throws.
- `cidBytes` is `2` for `Type0` fonts, `1` otherwise — `decodeShow` uses it to split `strBytes` into codes.

## See also

- [docs/api/README.md](../../README.md) — full module index + `exports` boundary note
- [`oconvPdfTextExtract`](./text-extract.md) — the sole consumer of this decoder
- [`oconvPdfToIr`](../pdf-to-ir.md) — the reader composing the pdf pipeline
- [loss matrix](../../../loss-matrix.md)
