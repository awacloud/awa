---
module: parsePath
category: interpolate
dependencies: []
returns: function
worker-safe: true
status: complete
---

# parsePath

> Parse SVG path `d` data to a canonical `M`/`C`/`Z` segment list for morphing.

**Member of** [`graphic.interpolate`](./index.md) | **Source** `packages/front/graphic/anim/src/interpolate/index.js` (factory-internal) | **Deps** none | **Worker-safe** yes

`parsePath` is a member of the resolved `graphic.interpolate` surface — it is
**not** a standalone module. It is defined inside the descriptor's factory and
returned for direct use. The companion path helpers `normalize`, `isCompatible`
and `formatPath` are factory-internal and **not** exposed; they drive the
`path` dispatch of `interpolator`.

## Resolve

```js
import { interpolateModule } from '@awacloud/graphic-anim';
import { lerpModule } from '@awacloud/graphic-anim';
import { unitsModule } from '@awacloud/graphic-anim';
import { matrixModule } from '@awacloud/graphic-anim';
import { colorModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

const lerp = lerpModule.factory(interp.factory());
const { parsePath } = interpolateModule.factory(
    lerp, unitsModule.factory(), matrixModule.factory(lerp), colorModule.factory(lerp),
);
// parsePath(d) => PathSeg[]
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `parsePath` | `(d: string) => PathSeg[]` | Canonical `M`/`C`/`Z` segments |

`PathSeg` = `{ cmd: string, coords: number[] }`. After `parsePath` the only
commands present are `M` (2 coords), `C` (6 coords) and `Z` (0 coords).

The structural-alignment step (pad the shorter curve run with degenerate cubics)
and the `d` serialization (coords rounded to 1e-3) run inside the descriptor's
`interpolator` for the `path` kind; they are not part of the public surface.

## Examples

```js
// Every command reduces to the M/C/Z canonical set.
parsePath('M0 0 H10 V10 Q5 5 0 0 Z');   // [M, C, C, C, Z]

// Arc A → cubic Béziers.
parsePath('M10 0 A10 10 0 0 1 0 10');   // M then ≥1 C tracking the quarter-circle

// Differing paths morph through interpolator (internal normalize + format).
const morph = interpolator('M0 0 L10 10', 'M0 0 L5 5 L10 10 L15 0');
morph(0.5);                              // a valid d — equal length + commands
```

## Notes

- **Coverage of the path grammar**:
  - **Full command coverage** — `M/L/H/V/C/S/Q/T/A/Z` and their relative
    (lowercase) forms, plus implicit repeated commands. The first draft covered
    only absolute `M/L/C/Z` and threw on the rest.
  - **Shorthands** resolve their implicit control points: `H/V → L`, `S`/`T`
    reflect the previous cubic/quadratic control point, `Q → C` (quadratic
    elevation).
  - **Arc `A` → cubic Béziers** via the standard endpoint→centre conversion
    (SVG F.6), split into ≤ 90° sub-arcs.
  - **Normalization** (internal) pads the shorter curve run with degenerate
    (zero-length) cubics so arbitrary morphs reach structural compatibility
    instead of throwing. The fast path (already-compatible inputs) is
    preserved unchanged.
- Only genuinely empty/blank or malformed `d` (bad start, missing coordinate,
  unsupported letter) throws.
- Serialized output rounds each coordinate to 1e-3 (as from the start).

## See also

- [interpolate](./index.md) — the descriptor that folds + uses the path engine
- [transform](./transform.md) — the sibling parser for the `transform` kind
