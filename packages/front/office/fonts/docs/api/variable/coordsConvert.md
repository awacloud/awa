---
module: varCoordsConvert
category: variable/coordsConvert
dependencies: [tableAvar]
returns: object
worker-safe: true
status: complete
---

# varCoordsConvert

> Convert user-space variation axis values to the normalised `[-1, +1]` coordinates that `gvar` tuples use (OT §10.6.2).

**Module** `varCoordsConvert` | **Source** `packages/front/office/fonts/src/variable/coordsConvert.js` | **Deps** `tableAvar` | **Worker-safe** yes

Each axis value is first mapped linearly around the axis default, then, when `avar` segment maps are supplied, remapped non-linearly through them. Every linear value lies in `[-1, +1]`; the final value stays in that range as long as the `avar` maps themselves do.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `normaliseAxisValue` | function | `(value: number, axis: { minValue, defaultValue, maxValue }) => number` — linear normalisation of one value. Returns `0` at `defaultValue`; `(value - default) / (max - default)` above it, clamped to at most `1`; `(value - default) / (default - min)` below it, clamped to at least `-1`. Returns `0` when the relevant side of the axis has zero width (`max === default` above, `min === default` below). |
| `normaliseAxesCoords` | function | `(userCoords: { [tag]: number }, fvarAxes: Axis[], avarSegmentMaps?: SegmentMap[]) => number[]` — normalises a whole location. The result has one entry per `fvarAxes` item, in axis order. A tag missing from `userCoords` (or `null`) uses that axis's `defaultValue`. When `avarSegmentMaps` is given, entry *i* of it remaps axis *i* through `tableAvar`'s `applyAvarSegment`; otherwise the linear value is returned as is. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { normaliseAxisValue, normaliseAxesCoords } = fw.runtime.resolve('varCoordsConvert');

const wght = { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 };
normaliseAxisValue(400, wght);  // 0
normaliseAxisValue(900, wght);  // 1
normaliseAxisValue(250, wght);  // -0.5
normaliseAxisValue(2000, wght); // 1 (clamped)

// fvar axes, optionally with avar segment maps (parseFvar / parseAvar output)
normaliseAxesCoords({ wght: 700 }, [wght]); // [0.6]
```

## Notes

- Out-of-range input is clamped by `normaliseAxisValue`; `normaliseAxesCoords` does not clamp after an `avar` remap.
- `avarSegmentMaps` is the `segmentMaps` array decoded by [avar](../table/avar.md); its length should match the `fvar` axis count.
- The output feeds the `coord` arguments of [instance](./instance.md) (`tupleScalar`).

## See also

- [fvar](../table/fvar.md) — axis definitions (`minValue` / `defaultValue` / `maxValue`)
- [avar](../table/avar.md) — segment maps and `applyAvarSegment`
- [gvar](../table/gvar.md) — glyph variation tuples
- [instance](./instance.md) — tuple scalars from the normalised coordinates
