---
module: graphic.matrix
category: math
dependencies: [graphic.lerp]
returns: object
worker-safe: true
status: complete
---

# graphic.matrix

> 2D affine Matrix + decomposition for transform interpolation — capture-free fw module descriptor.

**Module** `graphic.matrix` | **Source** `packages/front/graphic/anim/src/math/matrix.js` | **Deps** `graphic.lerp` | **Worker-safe** yes

## Descriptor shape

```js
import { matrixModule } from '@awacloud/graphic-anim';

// matrixModule = {
//   name: 'graphic.matrix',
//   type: 'lib.graphic.math',
//   version: '0.1.0',
//   dependencies: ['graphic.lerp'],
//   deps: [lerpModule],
//   factory(lerp) => { Matrix, lerpDecomposition }
// }
```

## Resolve

```js
import { lerpModule } from '@awacloud/graphic-anim';
import { matrixModule } from '@awacloud/graphic-anim';

// Manual resolution (no runtime):
const lerp = lerpModule.factory(interp.factory());
const { Matrix, lerpDecomposition } = matrixModule.factory(lerp);

// Via fw ModuleRuntime:
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { interp } from '@awacloud/fw/io/math/interp.js';
const rt = new ModuleRuntime();
rt.registerDeep(matrixModule);
const { Matrix, lerpDecomposition } = rt.resolve('graphic.matrix');
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `new Matrix` | `(a?, b?, c?, d?, e?, f?: number)` | A `Matrix` (SVG/CSS 6-tuple, defaults to identity) |
| `Matrix.identity` | `() => Matrix` | The identity matrix |
| `Matrix.fromDecomposition` | `(d: Partial<AffineDecomposition>) => Matrix` | Compose translate · rotate · skew · scale |
| `matrix.multiply` | `(o: Matrix) => Matrix` | Product `this · o` (apply `o` first) |
| `matrix.decompose` | `() => AffineDecomposition` | Split into 7 lerpable channels |
| `matrix.toString` | `() => string` | `matrix(a,b,c,d,e,f)` (rounded to 1e-6, `-0` → `0`) |
| `lerpDecomposition` | `(from, to: AffineDecomposition, t: number) => AffineDecomposition` | Channel-wise blend (uses injected scalar lerp param) |

`AffineDecomposition` channels: `translateX`, `translateY`, `rotate` (deg),
`scaleX`, `scaleY`, `skewX` (deg), `skewY` (deg).

## Examples

```js
import { lerpModule } from '@awacloud/graphic-anim';
import { matrixModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

const lerp = lerpModule.factory(interp.factory());
const { Matrix, lerpDecomposition } = matrixModule.factory(lerp);

// Compose then read back the channels — round-trips within 1e-6.
const m = Matrix.fromDecomposition({ translateX: 10, rotate: 30, scaleX: 2, skewX: 15 });
const d = m.decompose();   // { translateX: 10, rotate: 30, scaleX: 2, skewX: 15, ... }

// Interpolate a transform halfway between two states.
const a = new Matrix().decompose();
const b = m.decompose();
const half = Matrix.fromDecomposition(lerpDecomposition(a, b, 0.5));
half.toString();           // "matrix(...)"
```

## Worker Usage

```js
// Pure math — no DOM. The descriptor is Worker-safe; factory outputs are Worker-safe.
import { lerpModule } from '@awacloud/graphic-anim';
import { matrixModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

const lerp = lerpModule.factory(interp.factory());
const { Matrix, lerpDecomposition } = matrixModule.factory(lerp);
```

## Notes

- **Capture-free descriptor**: the `Matrix` class and `lerpDecomposition` function are
  defined INSIDE `factory(lerp)`. The `lerp` parameter (injected scalar lerp) is
  the only dependency — no module-scope capture inside the factory body.
- **QR skewX/skewY split**: `decompose` uses the standard CSS /
  Gram–Schmidt 2D matrix-decomposition algorithm, upgrading the first draft's single-`skew`
  angle. The shear of a pure affine map lands on `skewX`; `skewY` is `0` (kept
  in the channel set for symmetry and lerp stability).
- `fromDecomposition(decompose(M))` reproduces any affine `M` to within 1e-6,
  including non-uniform scale, shear, and negative-determinant mirrors
  (det &lt; 0 → negative `scaleX`).
- Immutable in spirit: every operation returns a fresh `Matrix`; inputs are
  never mutated.

## See also

- [scalar](./scalar.md) — `graphic.lerp` descriptor, the injected dependency
- [units](./units.md) — CSS unit split/format companion in the pure-math layer
