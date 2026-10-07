---
module: tableAvar
category: table/avar
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableAvar

> Table `avar` — Axis Variations (OT §10.6.3).

**Module** `tableAvar` | **Source** `packages/front/office/fonts/src/table/avar.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Per-axis segment map that adjusts the normalised coordinate `[-1,+1]` before the gvar deltas are applied — makes the perceived weight/width transition non-linear.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseAvar` | function | `(bytes) => { majorVersion, minorVersion, segmentMaps: SegmentMap[] }`. |
| `applyAvarSegment` | function | `(segmentMap, normValue) => mappedNormValue`. |
| `tableAvar` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseAvar, applyAvarSegment } = fw.runtime.resolve('tableAvar');
const avar = parseAvar(sfnt.tables.avar.bytes);
const remapped = applyAvarSegment(avar.segmentMaps[0], 0.5);
```

## Notes

- Coordinates in F2Dot14 (`int16` / 16384).
- Linear interpolation between consecutive `axisValueMaps`.

## See also

- [fvar](./fvar.md) [gvar](./gvar.md)
