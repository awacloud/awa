---
module: fontWoff
category: sfnt/woff
dependencies: [fontErrors, fontsShared, fontReader, fontWriter, fontTag, zlib]
returns: object
worker-safe: true
status: complete
---

# fontWoff

> WOFF 1.0 container — RFC 8311 §3, zlib envelope around an SFNT.

**Module** `fontWoff` | **Source** `packages/front/office/fonts/src/sfnt/woff.js` | **Deps** `fontErrors`, `fontsShared`, `fontReader`, `fontWriter`, `fontTag`, `zlib` | **Worker-safe** yes

Decodes the WOFF1 envelope (`wOFF` signature + table directory) into a standalone SFNT. zlib decompression is injected by the caller (`@awacloud/fw/io/compress/zlib`) — no hard dependency on fw.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `WOFF_MAGIC` | const | `0x774F4646` (`'wOFF'`). |
| `parseWoff1Header` | function | `(bytes) => { signature, flavor, length, numTables, totalSfntSize, … }`. |
| `decodeWoff1` | function | `(bytes, deps?) => Uint8Array` (reassembled SFNT). `deps.zlib` overrides the DI-injected `zlib` module. |
| `parseHeader` / `decode` | function | One-argument aliases of `parseWoff1Header` and of `decodeWoff1` bound to the DI-injected `zlib`. |
| `fontWoff` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { decode } = fw.runtime.resolve('fontWoff');
const sfnt = decode(woffBytes);   // standalone SFNT bytes (zlib is DI-injected)
```

## Notes

- A table whose `compLength === origLength` is kept raw (no zlib).
- The `meta` / `priv` blocks (XML metadata, private data) are ignored on decode.

## See also

- [sfnt](./sfnt.md)
- [woff2](./woff2.md)
