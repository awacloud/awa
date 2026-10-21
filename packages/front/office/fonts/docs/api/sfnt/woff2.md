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

Reads the WOFF2 envelope (`wOF2` signature, `UIntBase128` directory, Brotli body). The **glyf/loca transform is not inverted**: `decodeWoff2` returns `{ header, body, tables, inverseGlyfTransform }`, where `tables` is keyed by table tag (`{ tag, origLength, transformLength, transformed, bytes }`) and `inverseGlyfTransform` is `true` only when there is no `glyf` table or it was not transformed — most real-world WOFF2 fonts carry a transformed `glyf`, so this flag is typically `false` for them. Untransformed tables can be reassembled directly.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `WOFF2_MAGIC` | const | `0x774F4632` (`'wOF2'`). |
| `WOFF2_KNOWN_TABLES` | const | List of indexed tags (flags `< 0x3F`). |
| `parseWoff2Header` | function | `(bytes) => { signature, flavor, length, numTables, … }`. |
| `decodeWoff2` | function | `(bytes, deps?) => { header, body, tables, inverseGlyfTransform }`. `deps.brotli` overrides the DI-injected `brotli` module. Throws the `ContractError` `fonts/woff2-no-dictionary` when the body uses the Brotli static dictionary and it is not loaded, the `ParseError` `fonts/woff2-bad-brotli` when the body does not decompress (the decoder's error as `cause` in both); a `FontError` thrown by an injected decoder passes through. |
| `parseHeader` / `decode` | function | One-argument aliases of `parseWoff2Header` and of `decodeWoff2` bound to the DI-injected `brotli`. |
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
```

## Notes

- The `brotli` module decodes the body, and most WOFF2 bodies use Brotli's static dictionary, which `@awacloud/fw` ships as a separate file (`io/compress/brotli_dict.bin`) and loads only on request: without it, such a body throws `fonts/woff2-no-dictionary`.
- A full SFNT is not reconstructed from a transformed `glyf` table: the transform is not reversed.
- `UIntBase128`: 1..5 bytes, 7 bits payload + continuation bit.

## See also

- [woff](./woff.md)
- [extra/woff2-write](../extra/woff2-write.md) — symmetric encoder
