---
module: tableSbix
category: table/sbix
dependencies: [fontErrors, fontReader, fontTag]
returns: object
worker-safe: true
status: complete
---

# tableSbix

> Table `sbix` — Standard Bitmap Graphics (OT §8.10, Apple).

**Module** `tableSbix` | **Source** `packages/front/office/fonts/src/table/sbix.js` | **Deps** `fontErrors`, `fontReader`, `fontTag` | **Worker-safe** yes

Per-glyph bitmaps (PNG/JPG/TIFF) organised into ppem strikes. Mainly used for Apple emoji.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseSbix` | function | `(bytes, numGlyphs) => { version, flags, strikes: Strike[] }`. Each strike exposes `getGlyphBitmap(gid)`. |
| `tableSbix` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSbix } = fw.runtime.resolve('tableSbix');
const sbix = parseSbix(sfnt.tables.sbix.bytes, font.maxp.numGlyphs);
const png = sbix.strikes[0].getGlyphBitmap(42); // { originOffsetX, originOffsetY, graphicType, data } | null
```

## Notes

- `graphicType` is a 4-char tag (`png `, `jpg `, `tiff`).
- `numGlyphs` is required (read from `maxp`).

## See also

- [colr](./colr.md) [cbdt](./cbdt.md) [cblc](./cblc.md)
