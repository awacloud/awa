---
module: fontTtc
category: sfnt/ttc
dependencies: [fontErrors, fontsShared, fontReader, fontWriter, fontTag]
returns: object
worker-safe: true
status: complete
---

# fontTtc

> TTC/OTC container — Font Collection (OT §5).

**Module** `fontTtc` | **Source** `packages/front/office/fonts/src/sfnt/ttc.js` | **Deps** `fontErrors`, `fontsShared`, `fontReader`, `fontWriter`, `fontTag` | **Worker-safe** yes

Reads the `ttcf` header and exposes each member font. `extractFont(bytes, i)` reconstructs a standalone TTF/OTF SFNT from the shared offsets.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `TTC_MAGIC` | const | `0x74746366` (`'ttcf'`). |
| `parseTtc` | function | `(bytes) => { ttcTag, majorVersion, minorVersion, numFonts, offsets }`. |
| `extractFont` | function | `(bytes, index) => Uint8Array` (standalone SFNT). |
| `ttcFontTagAt` | function | Returns the `sfntVersion` tag of font #index without extracting it. |
| `fontTtc` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseTtc, extractFont } = fw.runtime.resolve('fontTtc');
const head = parseTtc(ttcBytes);
const firstFont = extractFont(ttcBytes, 0);
```

## Notes

- TTC v2 DSIG is ignored (optional field not read).
- `extractFont` recomputes `searchRange/entrySelector/rangeShift` via `sfntSearchParams`.

## See also

- [sfnt](./sfnt.md)
- [woff](./woff.md) / [woff2](./woff2.md)
