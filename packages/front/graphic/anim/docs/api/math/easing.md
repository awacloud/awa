---
module: graphic.easing
category: math
type: lib.graphic.math
dependencies: [easing]
returns: object
worker-safe: true
status: complete
---

# graphic.easing

> 31 normalized Penner curves — shaped clock for value-agnostic interpolation.

**Descriptor** `easingModule` | **Name** `graphic.easing` | **Type** `lib.graphic.math` | **Source** `packages/front/graphic/anim/src/math/easing.js` | **Deps** fw `easing` (`io/calc/easing.js`) | **Worker-safe** yes

## Resolve

```js
// Via fw runtime (after registering graphicModules):
const easing = runtime.resolve('graphic.easing');
// easing.easeInOutCubic(t) => number

// Direct (standalone / test):
import { easingModule } from '@awacloud/graphic-anim';
import { easing as fwEasing } from '@awacloud/fw/io/calc/easing.js';
const easing = easingModule.factory(fwEasing.factory());
```

## Descriptor shape

```js
import { easingModule } from '@awacloud/graphic-anim';
import { easing as fwEasing } from '@awacloud/fw/io/calc/easing.js';

easingModule.name;          // 'graphic.easing'
easingModule.type;          // 'lib.graphic.math'
easingModule.version;       // '0.1.0'
easingModule.dependencies;  // ['easing']
easingModule.deps;          // [fw easing descriptor]
easingModule.factory(fwEasing.factory());     // Record<string, (t: number) => number>
```

## API

| Export | Signature | Returns |
|--------|-----------|---------|
| `easingModule` | Module descriptor | `{ name, type, version, dependencies, deps, factory }` |
| `easingModule.factory(fwEasing)` | `(fwEasing) => Object<string, NormalizedEase>` | Table of 31 easing functions, each `(t) => fwEasing[name](t, 0, 1, 1)` |
| `NormalizedEase` | `(t: number) => number` | Shaped progress: `t ∈ [0,1] → t' ∈ [0,1]` |

**Keys** (31 total): `linear`; `easeIn/Out/InOut` variants of `Quad`, `Cubic`, `Quart`, `Quint`, `Sine`, `Expo`, `Circ`, `Back`, `Elastic`, `Bounce`.

All curves satisfy `f(0) = 0` and `f(1) = 1`. Back/Elastic/Bounce may overshoot between the endpoints.

The curves are fw's (`io/calc/easing.js`, Penner's equations in `(t, b, c, d)` form, with their third-party notice in fw); this module only normalizes them. No curve is written in `graphic-anim`.

## Examples

```js
import { easingModule } from '@awacloud/graphic-anim';
import { lerpModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';
import { easing as fwEasing } from '@awacloud/fw/io/calc/easing.js';

const easing = easingModule.factory(fwEasing.factory());
const lerp = lerpModule.factory(interp.factory());

// Shape the clock with an easing, then interpolate a value
const t = 0.3;  // raw clock progress
const t2 = easing.easeInOutCubic(t);  // shaped progress
const value = lerp(0, 100, t2);       // apply to a range

// Use directly in a tween callback
const shaped = easing.easeOutBounce(t);
```

## Worker Usage

```js
// graphic.easing is pure arithmetic — Worker-safe.
import { easingModule } from '@awacloud/graphic-anim';
import { easing as fwEasing } from '@awacloud/fw/io/calc/easing.js';
const easing = easingModule.factory(fwEasing.factory());
const val = easing.easeInQuad(0.5);  // 0.25
```

## Notes

- Transcribed from `packages/front/fw/src/io/calc/easing.js` in normalized form (`fn(t, 0, 1, 1)`). Fidelity is guarded by a parity test in `easing.test.js` (tolerance 1e-9).
- The factory builds the table from its `fwEasing` parameter only — no module-scope bindings are captured (`fw/no-factory-capture` passes).
- The shipped module imports NO `@awacloud/fw` at runtime — self-contained and side-effect-free at import.
- The `(t,b,c,d)` Penner signature stays inside fw; this layer exposes only the normalized `(t)` form: use `lerp(a, b, easing.fn(t))`.

## See also

- [scalar](./scalar.md) — `lerp` that consumes the shaped `t'`
- [units](./units.md) — CSS unit companion
