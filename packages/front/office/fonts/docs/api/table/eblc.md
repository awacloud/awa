---
module: tableEblc
category: table/eblc
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableEblc

> Table `EBLC` — Embedded Bitmap Location (OT §8.4).

**Module** `tableEblc` | **Source** `packages/front/office/fonts/src/table/eblc.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Monochrome counterpart of [cblc](./cblc.md), with identical wire layout: a header followed by one 48-byte `bitmapSizeTable` per strike. It describes the strikes and where their index subtables live; the bitmaps themselves are in [ebdt](./ebdt.md).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseEblc` | function | `(bytes: Uint8Array) => { majorVersion, minorVersion, sizes: BitmapSizeTable[] }`. |
| `tableEblc` | factory | Factory `{ name, dependencies, factory }`. |

### `BitmapSizeTable`

| Field | Type |
|-------|------|
| `indexSubTableArrayOffset`, `indexTablesSize`, `numberOfIndexSubTables` | uint32 |
| `colorRef` | uint32 |
| `hori`, `vert` | `SbitLineMetrics` |
| `startGlyphIndex`, `endGlyphIndex` | uint16 |
| `ppemX`, `ppemY`, `bitDepth` | uint8 |
| `flags` | int8 |

### `SbitLineMetrics`

| Field | Type |
|-------|------|
| `ascender`, `descender` | int8 |
| `widthMax` | uint8 |
| `caretSlopeNumerator`, `caretSlopeDenominator`, `caretOffset` | int8 |
| `minOriginSB`, `minAdvanceSB`, `maxBeforeBL`, `minAfterBL` | int8 |
| `pad1`, `pad2` | int8 |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSfnt } = fw.runtime.resolve('fontSfnt');
const { parseEblc } = fw.runtime.resolve('tableEblc');

const sfnt = parseSfnt(bytes);   // bytes: Uint8Array of a font with EBLC + EBDT
const eblc = parseEblc(sfnt.tables.EBLC.bytes);
for (const s of eblc.sizes) console.log(s.ppemX, s.ppemY, s.startGlyphIndex, s.endGlyphIndex);
```

## Notes

- Both line-metrics blocks (`hori`, `vert`) are decoded for every strike.
- The index subtable arrays are not followed: `indexSubTableArrayOffset`, `indexTablesSize` and `numberOfIndexSubTables` are returned as offsets and counts for the consumer to load from the same table bytes.
- Errors (all `ParseError`): `fonts/eblc-short` (fewer than 8 bytes), `fonts/eblc-version` (major version is neither 2 nor 3).

## See also

- [ebdt](./ebdt.md) — the bitmap data located here
- [ebsc](./ebsc.md) — strikes obtained by scaling
- [cblc](./cblc.md) — color bitmap location counterpart
- [cbdt](./cbdt.md) — color bitmap data counterpart
