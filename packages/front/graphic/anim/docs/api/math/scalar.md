---
module: graphic.lerp
category: math
type: lib.graphic.math
dependencies: [interp]
returns: function
worker-safe: true
status: complete
---

# graphic.lerp

> Scalar linear interpolation — the shared numeric primitive for all tween math.

**Descriptor** `lerpModule` | **Name** `graphic.lerp` | **Type** `lib.graphic.math` | **Source** `packages/front/graphic/anim/src/math/scalar.js` | **Deps** fw `interp` (`io/math/interp.js`) | **Worker-safe** yes

## Resolve

```js
// Via fw runtime (after registering graphicModules):
const lerp = runtime.resolve('graphic.lerp');
// lerp(a, b, t) => number

// Direct (standalone / test):
import { lerpModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';
const lerp = lerpModule.factory(interp.factory());
```

## Descriptor shape

```js
import { lerpModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

lerpModule.name;          // 'graphic.lerp'
lerpModule.type;          // 'lib.graphic.math'
lerpModule.version;       // '0.1.0'
lerpModule.dependencies;  // ['interp']
lerpModule.deps;          // [fw interp descriptor]
lerpModule.factory(interp.factory());     // (a, b, t) => number
```

## API

| Resolved value | Signature | Returns |
|----------------|-----------|---------|
| `lerp` | `(a: number, b: number, t: number) => number` | Interpolated value |

## Examples

```js
import { interp } from '@awacloud/fw/io/math/interp.js';
const lerp = lerpModule.factory(interp.factory());

lerp(0, 100, 0.5);  // 50
lerp(0, 100, 0);    // 0
lerp(0, 100, 1);    // 100
lerp(0, 100, 1.5);  // 150  (extrapolates — not clamped)
```

## Worker Usage

```js
// graphic.lerp is pure arithmetic — Worker-safe.
// Register via graphicModules in a Worker runtime, or call
// factory(interp.factory()) directly (fw interp is pure arithmetic too).
import { lerpModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';
const lerp = lerpModule.factory(interp.factory());
```

## Notes

- Not clamped: `t` values outside `[0,1]` extrapolate linearly. Clamping is the Tween's responsibility.
- Used internally by `graphic.matrix` (`lerpDecomposition`), `graphic.color` (`lerp`), and `graphic.interpolate`.

## See also

- [easing](./easing.md) — reshapes the clock `t` before it reaches `lerp`
- [units](./units.md) — CSS unit split/format companion
