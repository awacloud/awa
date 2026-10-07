---
module: tableSvg
category: table/svg
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableSvg

> Table `SVG ` — SVG Document table (OT §8.9).

**Module** `tableSvg` | **Source** `packages/front/office/fonts/src/table/svg.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

SVG documents per glyphID range. Raw bytes exposed (gzip detected via the 3 bytes `1F 8B 08`) — decompression is the consumer's responsibility.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseSvg` | function | `(bytes) => { version, documents: { startGlyphID, endGlyphID, svgDocOffset, svgDocLength, getBytes(), isGzipped() }[] }`. `getBytes()` returns the raw `Uint8Array` slice (or `null` if out of range); `isGzipped()` checks the gzip magic bytes. |
| `tableSvg` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSvg } = fw.runtime.resolve('tableSvg');
const svg = parseSvg(sfnt.tables['SVG '].bytes);
const doc = svg.documents[0];
const bytes = doc.getBytes();
```

## Notes

- Gzip decompression: use `@awacloud/fw/io/compress/gzip.js`.
- A document can cover several glyphs (inclusive range).

## See also

- [colr](./colr.md) [sbix](./sbix.md) [cbdt](./cbdt.md)
