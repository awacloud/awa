---
module: extraWoff2Write
category: extra/woff2-write
dependencies: [fontErrors, fontWriter, fontSfnt, brotli]
returns: object
worker-safe: true
status: complete
---

# extraWoff2Write

> WOFF2 encoder — packs an SFNT into a Brotli envelope (no glyf/loca transform).

**Module** `extraWoff2Write` | **Source** `packages/front/office/fonts/src/extra/woff2-write.js` | **Deps** `fontErrors`, `fontWriter`, `fontSfnt`, `brotli` | **Worker-safe** yes

Symmetric counterpart to the `fontWoff2` reader: emits the WOFF2 header, the `UIntBase128` directory, and the Brotli-compressed concatenation of the **untransformed** tables. The glyf/loca transform stays out of scope.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `WOFF2_MAGIC` | const | `0x774F4632`. |
| `encodeWoff2` | function | `(sfntBytes, brotli: { brotliCompressSync }) => Uint8Array` (WOFF2 bytes). |
| `encode` | function | `(sfntBytes) => Uint8Array` — convenience overload bound to the DI-injected `brotli` module; equivalent to `encodeWoff2(sfntBytes, brotliMod)`. Not documented on the previous revision of this page (`woff2-write.js` line 123). |
| `extraWoff2Write` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { encode } = fw.runtime.resolve('extraWoff2Write');
const woff2 = encode(sfntBytes);   // brotli is DI-injected
```

## Transform versions

Each table-directory entry starts with a flags byte: bits 0-5 hold the known-tag index and bits 6-7 the preprocessing transformation version (W3C WOFF2 § 4.1). The encoder always uses index 63 (the explicit 4-byte tag follows, slightly larger than the known-tag form) and writes every table body **untransformed**, so it marks each entry with its *null* transform: version 3 for `glyf` and `loca` (flags `0xFF`), where version 0 would mean the WOFF2 glyf/loca transform, and version 0 for every other table (flags `0x3F`). Because no table is transformed, no entry carries a `transformLength`. A full TrueType font (`glyf` + `loca`) therefore round-trips through `decodeWoff2` with every table byte-identical to the source SFNT (`inverseGlyfTransform: true`); the output is larger than a transformed WOFF2, since the glyf/loca transform itself is not implemented.

## Notes

- The factory's DI dependency list also includes `brotli` (`@awacloud/fw/io/compress/brotli.js`) beyond `fontErrors`/`fontWriter`/`fontSfnt` — it powers the `encode` convenience overload. A hand-built `brotli` passed to `encodeWoff2` needs its full dependency set (`lz77` included) to compress a real font.
- Not included in `fonts-large`; requires the `fonts-full` bundle.

## See also

- [sfnt/woff2](../sfnt/woff2.md) — symmetric reader
