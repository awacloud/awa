---
module: varInstance
category: variable/instance
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# varInstance

> Tuple scalars for `gvar` variation tuples and in-place application of decoded point deltas to a glyph (OT §10.6.2).

**Module** `varInstance` | **Source** `packages/front/office/fonts/src/variable/instance.js` | **Deps** `fontErrors` | **Worker-safe** yes

This module computes the scalar of a variation tuple at a normalised axis location and applies already-decoded `gvar` deltas, scaled by that scalar, to a glyph's points. It does **not** instantiate a font: there is no `instantiate(font, coords)` entry point, and decoding the tuples, selecting the deltas of each glyph and re-encoding the `glyf` data remain the caller's job.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `axisScalar` | function | `(peak: number, coord: number, intermStart?: number, intermEnd?: number) => number` — scalar in `[0, 1]` for one axis. `1` when `peak` is `0` (axis unused) or `coord === peak`. With an explicit intermediate range: `0` outside `[intermStart, intermEnd]`, otherwise a linear ramp up to the peak and back down. Without one: a triangle from `0` through `peak`, `0` when `coord` is on the other side of zero or at/beyond `peak`. |
| `tupleScalar` | function | `(peak: number[], coord: number[], intermStart?: number[], intermEnd?: number[]) => number` — product of the per-axis scalars, short-circuiting to `0` at the first zero. Throws a `ContractError` (code `fonts/var-tuple-mismatch`) when `peak` is missing or its length differs from `coord`. |
| `applyGvarDeltas` | function | `(glyph: { points: { x, y, onCurve }[] }, deltas: { pointNumbers: number[], deltaX: number[], deltaY: number[] }, scalar: number) => void` — adds `delta * scalar` to the point coordinates in place. An empty `pointNumbers` means every point (up to the shorter of `deltaX.length` and `points.length`); otherwise only the listed indices are touched, and out-of-range indices are skipped. Returns without effect when `scalar` is `0` or the glyph / deltas are missing. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { tupleScalar, applyGvarDeltas } = fw.runtime.resolve('varInstance');

// One tuple over two axes, evaluated at a normalised location.
const scalar = tupleScalar([1, 0], [0.5, 0.25]); // 0.5 (second axis unused)

const glyph = { points: [{ x: 0, y: 0, onCurve: true }, { x: 100, y: 0, onCurve: true }] };
applyGvarDeltas(glyph, { pointNumbers: [], deltaX: [10, 20], deltaY: [0, 0] }, scalar);
// glyph.points[1].x === 110
```

## Notes

- Coordinates passed as `coord` are normalised values; build them with [coordsConvert](./coordsConvert.md).
- `applyGvarDeltas` mutates the glyph and does not interpolate untouched points (no inferred deltas for points absent from `pointNumbers`).
- The deltas must already be unpacked, for example with the point-number and delta decoders exposed by [gvar](../table/gvar.md).

## See also

- [coordsConvert](./coordsConvert.md) — user-space values to normalised coordinates
- [gvar](../table/gvar.md) — glyph variation table and its packed-data decoders
- [errors](../errors.md) — `ContractError`
