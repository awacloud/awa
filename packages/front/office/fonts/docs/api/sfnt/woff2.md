---
module: fontWoff2
category: sfnt/woff2
dependencies: [fontErrors, fontsShared, fontReader, fontTag, brotli]
returns: object
worker-safe: true
status: complete
---

# fontWoff2

> WOFF2 container — RFC 8311 §4, Brotli + glyf/loca transform.

**Module** `fontWoff2` | **Source** `packages/front/office/fonts/src/sfnt/woff2.js` | **Deps** `fontErrors`, `fontsShared`, `fontReader`, `fontTag`, `brotli` | **Worker-safe** yes

Reads the WOFF2 envelope (`wOF2` signature, `UIntBase128` directory, Brotli body). `decodeWoff2` returns the tables as stored: `{ header, body, tables, inverseGlyfTransform }`, where `tables` is keyed by table tag (`{ tag, origLength, transformLength, transformed, bytes }`) and `inverseGlyfTransform` is `true` only when there is no `glyf` table or it was not transformed — most real-world WOFF2 fonts carry a transformed `glyf`, so this flag is typically `false` for them. `woff2ToSfnt` / `toSfnt` reassemble one SFNT with the transforms reversed, ready for `fonts.read`.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `WOFF2_MAGIC` | const | `0x774F4632` (`'wOF2'`). |
| `WOFF2_KNOWN_TABLES` | const | List of indexed tags (flags `< 0x3F`). |
| `parseWoff2Header` | function | `(bytes) => { signature, flavor, length, numTables, … }`. |
| `decodeWoff2` | function | `(bytes, deps?) => { header, body, tables, inverseGlyfTransform }`. `deps.brotli` overrides the DI-injected `brotli` module. Throws the `ContractError` `fonts/woff2-no-dictionary` when the body uses the Brotli static dictionary and it is not loaded, the `ParseError` `fonts/woff2-bad-brotli` when the body does not decompress (the decoder's error as `cause` in both); a `FontError` thrown by an injected decoder passes through. |
| `woff2ToSfnt` | function | `(bytes, deps?) => Uint8Array` — one SFNT: the body decoded as `decodeWoff2` does, the `glyf` / `loca` transform (version 0) and the `hmtx` transform (version 1) reversed (W3C WOFF2 § 5), every table packed in tag order, 4-byte aligned, with its checksum and `head.checkSumAdjustment`; untransformed tables byte for byte. Throws the `ParseError` `fonts/woff2-bad-transform` (`context.table`, and `context.glyph` when one glyph is at fault) for a malformed transform — `glyf` without `loca` transformed or the reverse, an unknown transform version, a stream shorter than its glyphs need, a composite or empty glyph whose bounding-box bit is wrong — and the `ContractError` `fonts/woff2-collection` for a `ttcf` flavour, plus `decodeWoff2`'s errors. |
| `parseHeader` / `decode` / `toSfnt` | function | One-argument aliases of `parseWoff2Header`, of `decodeWoff2` and of `woff2ToSfnt` bound to the DI-injected `brotli`. |
| `fontWoff2` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';
import { readFileSync } from 'node:fs';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
// Load the Brotli static dictionary once per runtime (Bun / Node; in a
// browser: await words.load(url) — see brotliDictWords in @awacloud/fw).
const words = fw.runtime.resolve('brotliDictWords');
words.setBlob(new Uint8Array(readFileSync(new URL(import.meta.resolve('@awacloud/fw/io/compress/brotli_dict.bin')))));
const { decode } = fw.runtime.resolve('fontWoff2');
const { header, body, tables, inverseGlyfTransform } = decode(woff2Bytes);   // brotli is DI-injected
const font = fw.runtime.resolve('fonts').read(fw.runtime.resolve('fontWoff2').toSfnt(woff2Bytes));
```

## Notes

- The `brotli` module decodes the body, and most WOFF2 bodies use Brotli's static dictionary, which `@awacloud/fw` ships as a separate file (`io/compress/brotli_dict.bin`) and loads only on request: without it, such a body throws `fonts/woff2-no-dictionary`.
- `toSfnt` reverses the transforms of W3C WOFF2 § 5: a transformed `glyf` gives back the same glyphs (contours, points, on-curve flags, instructions, bounding boxes) as the source font — the fonttools `TestWOFF2.woff2` equals its `TestTTF.ttf` glyph for glyph — though not always the same bytes (the flags and deltas are re-encoded, each glyph padded to 4 bytes). A WOFF2 collection is not reassembled.
- `UIntBase128`: 1..5 bytes, 7 bits payload + continuation bit.

## See also

- [woff](./woff.md)
- [extra/woff2-write](../extra/woff2-write.md) — symmetric encoder
