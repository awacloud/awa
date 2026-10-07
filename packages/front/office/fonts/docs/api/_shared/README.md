---
module: fontsShared
category: _shared
dependencies: []
returns: object
worker-safe: true
status: complete
---

# fontsShared

> Font container constants and stateless helpers shared across the SFNT, TTC, WOFF and WOFF2 factories.

**Module** `fontsShared` | **Source** `packages/front/office/fonts/src/_shared/index.js` | **Deps** _(none)_ | **Worker-safe** yes

Single source for the container signatures, the `head.checksumAdjustment` constant, the symbolic flavor names and the binary-search triplet that every SFNT-style table directory carries. The container modules ([sfnt](../sfnt/sfnt.md), [ttc](../sfnt/ttc.md), [woff](../sfnt/woff.md), [woff2](../sfnt/woff2.md)) resolve it instead of keeping their own copies.

## Exports

### Magic numbers

All values are unsigned 32-bit integers.

| Symbol | Type | Description |
|--------|------|-------------|
| `SFNT_TT_OUTLINES` | number | `0x00010000` — `sfntVersion` of a TrueType-outline font. |
| `SFNT_CFF_OUTLINES` | number | `0x4F54544F` (`'OTTO'`) — `sfntVersion` of a CFF-outline OpenType font. |
| `SFNT_APPLE_TRUE` | number | `0x74727565` (`'true'`) — Apple TrueType `sfntVersion`. |
| `SFNT_APPLE_TYP1` | number | `0x74797031` (`'typ1'`) — Apple Type 1 wrapper `sfntVersion`. |
| `TTC_MAGIC` | number | `0x74746366` (`'ttcf'`) — font collection signature. |
| `WOFF_MAGIC` | number | `0x774F4646` (`'wOFF'`) — WOFF 1 signature. |
| `WOFF2_MAGIC` | number | `0x774F4632` (`'wOF2'`) — WOFF 2 signature. |
| `CHECKSUM_MAGIC` | number | `0xB1B0AFBA` — constant that `head.checksumAdjustment` makes the whole-font checksum sum to. |

### Flavor helpers

| Symbol | Type | Description |
|--------|------|-------------|
| `SFNT_FLAVOR` | object | Frozen dictionary of flavor names: `TRUETYPE` = `'truetype'`, `OPENTYPE` = `'opentype'`, `APPLE_TRUE` = `'apple-true'`, `APPLE_TYP1` = `'apple-typ1'`. |
| `flavorFromVersion` | function | `(v: number) => string \| null` — maps a 4-byte `sfntVersion` to its flavor name; `null` for an unknown version. The input is coerced with `>>> 0`. |
| `versionFromFlavor` | function | `(f: string) => number` — inverse mapping; an unknown flavor falls back to `SFNT_TT_OUTLINES`. |

### Table directory search parameters

| Symbol | Type | Description |
|--------|------|-------------|
| `sfntSearchParams` | function | `(numTables: number) => { searchRange, entrySelector, rangeShift }` — the legacy binary-search triplet: `searchRange` = largest power of two ≤ `numTables` × 16, `entrySelector` = its base-2 logarithm, `rangeShift` = `numTables` × 16 − `searchRange`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { flavorFromVersion, sfntSearchParams, SFNT_CFF_OUTLINES } = fw.runtime.resolve('fontsShared');

flavorFromVersion(SFNT_CFF_OUTLINES); // 'opentype'
sfntSearchParams(9);                  // { searchRange: 128, entrySelector: 3, rangeShift: 16 }
```

## Notes

- Pure and stateless: every export is a constant or a function of its arguments, so the module can be shipped to a worker as-is.
- `sfntSearchParams(0)` returns `{ searchRange: 16, entrySelector: 0, rangeShift: -16 }`; callers are expected to pass at least one table.
- `versionFromFlavor` never returns `null`: an unrecognised flavor is treated as TrueType outlines.

## See also

- [sfnt](../sfnt/sfnt.md) — plain SFNT container reader / writer
- [ttc](../sfnt/ttc.md) — font collections
- [woff](../sfnt/woff.md) — WOFF 1 container
- [woff2](../sfnt/woff2.md) — WOFF 2 container
