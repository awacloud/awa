---
module: tableVhea
category: table/vhea
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableVhea

> Table `vhea` — Vertical Header (OT §6.4.10), 36 bytes.

**Module** `tableVhea` | **Source** `packages/front/office/fonts/src/table/vhea.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Vertical analogue of [hhea](./hhea.md). `numOfLongVerMetrics` decides how many full `(advanceHeight, tsb)` records precede the tsb-only tail of [vmtx](./vmtx.md).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseVhea` | function | `(bytes: Uint8Array) => VheaTable`. Throws `ParseError` `fonts/vhea-short` when fewer than 36 bytes are given. |
| `encodeVhea` | function | `(h: VheaTable) => Uint8Array`. Exactly 36 bytes; missing fields take defaults (see Notes). |
| `tableVhea` | factory | Factory `{ name, dependencies, factory }`. |

### `VheaTable`

| Field | Type |
|-------|------|
| `majorVersion`, `minorVersion` | uint16 |
| `ascender`, `descender`, `lineGap` | int16 |
| `advanceHeightMax` | int16 |
| `minTopSideBearing`, `minBottomSideBearing`, `yMaxExtent` | int16 |
| `caretSlopeRise`, `caretSlopeRun`, `caretOffset` | int16 |
| `metricDataFormat` | int16 |
| `numOfLongVerMetrics` | uint16 |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSfnt } = fw.runtime.resolve('fontSfnt');
const { parseVhea, encodeVhea } = fw.runtime.resolve('tableVhea');

const sfnt = parseSfnt(bytes);   // bytes: Uint8Array of a font with a vhea table
const vhea = parseVhea(sfnt.tables.vhea.bytes);
console.log(vhea.ascender, vhea.numOfLongVerMetrics);
const out = encodeVhea(vhea);    // 36 bytes
```

## Notes

- `parseVhea` skips the four reserved `int16` fields between `caretOffset` and `metricDataFormat`; `encodeVhea` writes them as zero.
- `encodeVhea` defaults: `majorVersion` 1, `minorVersion` 0, `caretSlopeRun` 1, every other field 0. `parseVhea` does not check the version.

## See also

- [vmtx](./vmtx.md) — the metrics array this header sizes
- [vorg](./vorg.md) — vertical origins
- [hhea](./hhea.md) — horizontal counterpart
