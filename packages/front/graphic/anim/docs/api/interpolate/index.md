---
module: graphic.interpolate
category: interpolate
dependencies: [graphic.lerp, graphic.units, graphic.matrix, graphic.color]
returns: { detect, interpolator, parseTransform, parsePath }
worker-safe: true
status: complete
---

# graphic.interpolate

> Value-type detection → typed interpolator seam, plus the transform parser and
> path engine, collapsed into ONE capture-free fw module descriptor.

**Module** `graphic.interpolate` | **Source** `packages/front/graphic/anim/src/interpolate/index.js` | **Type** `lib.graphic.interpolate` | **Deps** `graphic.lerp`, `graphic.units`, `graphic.matrix`, `graphic.color` | **Worker-safe** yes

## Descriptor

```js
import { interpolateModule } from '@awacloud/graphic-anim';

interpolateModule.name;         // 'graphic.interpolate'
interpolateModule.type;         // 'lib.graphic.interpolate'
interpolateModule.dependencies; // ['graphic.lerp','graphic.units','graphic.matrix','graphic.color']
interpolateModule.deps;         // [lerpModule, unitsModule, matrixModule, colorModule]
```

The factory injects the four resolved math dependencies and returns the public
surface. The SVG/CSS transform parser, the SVG path engine (parse, arc→cubic,
quad→cubic, normalize, format, tokenize, the `ARITY` table) and all detection
regexes are **defined inside the factory body** — private to the module, never
module-scope (enforced by `fw/no-factory-capture`).

```js
factory(lerp, units, matrix, color) => { detect, interpolator, parseTransform, parsePath }
```

| Param | Shape (resolved dependency) |
|-------|-----------------------------|
| `lerp` | `(a,b,t) => number` (the scalar fn) |
| `units` | `{ split, format }` |
| `matrix` | `{ Matrix, lerpDecomposition }` |
| `color` | `{ parse, lerp, format, CSS_NAMED_COLORS }` |

## Resolve

```js
import { interpolateModule } from '@awacloud/graphic-anim';
import { lerpModule } from '@awacloud/graphic-anim';
import { unitsModule } from '@awacloud/graphic-anim';
import { matrixModule } from '@awacloud/graphic-anim';
import { colorModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

const lerp = lerpModule.factory(interp.factory());
const { detect, interpolator, parseTransform, parsePath } =
    interpolateModule.factory(
        lerp,
        unitsModule.factory(),
        matrixModule.factory(lerp),
        colorModule.factory(lerp),
    );
```

In an fw runtime the descriptor is registered and resolved by name; the
standalone surface inlines all four factories.

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `detect` | `(value: string\|number) => ValueKind` | One of `number\|unit\|color\|transform\|path` |
| `interpolator` | `(from, to: string\|number) => (t: number) => string\|number` | A typed blender bound to the pair |
| `parseTransform` | `(str: string) => Matrix` | The composed affine matrix (see [transform](./transform.md)) |
| `parsePath` | `(d: string) => PathSeg[]` | Canonical `M`/`C`/`Z` segments (see [path](./path.md)) |

`ValueKind` = `'number' | 'unit' | 'color' | 'transform' | 'path'`.

**Detection order** (significant): `number → path → transform → color → unit`
(unit is the string fallthrough).

**Dispatch**:

| Kind | Strategy |
|------|----------|
| `number` | scalar `lerp` |
| `unit` | `units.split` both ends, lerp, reformat (throws on unit mismatch) |
| `color` | `color.lerp` in RGBA space → `rgb()/rgba()` |
| `transform` | Lists that match function by function (same length, same function at each position): each function's arguments lerped on their own (normalized first: `translate(x)` = `translate(x,0)`, `scale(s)` = `scale(s,s)`, `rotate(a)` = `rotate(a,0,0)`), written back as the list; a `matrix()` pair goes through the decomposition, in place. This is the CSS Transforms rule. Other lists: `parseTransform` → `decompose` → `matrix.lerpDecomposition` → `Matrix.fromDecomposition` → `matrix(...)` |
| `path` | `parsePath` + internal `normalize` both ends → point-wise coord lerp → `d` string |

## Examples

```js
detect(0.5);               // 'number'
detect('50px');            // 'unit'
detect('hsl(0,100%,50%)'); // 'color'  (hsl/named admitted)
detect('skewX(30)');       // 'transform'
detect('M0 0 L10 10');     // 'path'

const fade = interpolator(0, 1);
fade(0.5);                 // 0.5

const slide = interpolator('translate(0,0)', 'translate(100,0)');
slide(0.5);                // "translate(50,0)"

const zoom = interpolator('scale(0.75) translate(100,50)', 'scale(1) translate(0,0)');
zoom(0.5);                 // "scale(0.875,0.875) translate(50,25)" (per function)

const mixed = interpolator('translate(0,0)', 'scale(3)');
mixed(0.5);                // "matrix(2,0,0,2,0,0)" (no match: decomposition)

const morph = interpolator('M0 0 L10 10', 'M0 0 L5 5 L10 10 L15 0');
morph(0.5);                // a valid d — normalized, no throw
```

## Worker Usage

```js
// Pure detection + math — no DOM. Resolve the descriptor in any Worker context.
import { interpolateModule } from '@awacloud/graphic-anim';
```

## Notes

- **One descriptor**: `parseTransform` and `parsePath` are members of the
  resolved surface, not separate modules. The path helpers `normalize`,
  `isCompatible` and `formatPath` are factory-internal (not exposed).
- **Kind mismatch throws**: `interpolator(5, '#fff')` throws — both ends must
  detect to the same kind.
- **Detector**: `color` now admits `hsl()/hsla()` and the CSS
  named colours via the injected `color.CSS_NAMED_COLORS` (consistency with
  `color.parse`).
- **Path**: the `path` case normalizes arc inputs and
  differing-but-compatible structures instead of throwing; only genuinely
  empty/invalid `d` throws (via `parsePath`).
- `t` is never clamped — clamping is the Tween's job.
- **Capture-free**: the `PATH_RE`/`TRANSFORM_RE`/`COLOR_RE` regexes, the
  transform `FN_RE`, and the path `ARITY` table all live inside the factory; the
  math layer arrives only as parameters (never re-imported).

## See also

- [transform](./transform.md) — `parseTransform` (real skewX/skewY shear)
- [path](./path.md) — `parsePath`, arc→cubic + shorthand coverage
- [matrix](../math/matrix.md) — the affine engine behind `transform`
- [color](../math/color.md) — the RGBA blender behind `color`
