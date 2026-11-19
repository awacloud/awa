---
module: parseTransform
category: interpolate
dependencies: [graphic.matrix]
returns: function
worker-safe: true
status: complete
---

# parseTransform

> Parse an SVG/CSS transform function-list into a single affine `Matrix`.

**Member of** [`graphic.interpolate`](./index.md) | **Source** `packages/front/graphic/anim/src/interpolate/index.js` (factory-internal) | **Deps** `matrix.Matrix` (injected) | **Worker-safe** yes

`parseTransform` is a member of the resolved `graphic.interpolate` surface — it
is **not** a standalone module. It is defined inside the descriptor's factory
and uses the injected `matrix.Matrix` class; it is returned for direct use.

## Resolve

```js
import { interpolateModule } from '@awacloud/graphic-anim';
import { lerpModule } from '@awacloud/graphic-anim';
import { unitsModule } from '@awacloud/graphic-anim';
import { matrixModule } from '@awacloud/graphic-anim';
import { colorModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

const lerp = lerpModule.factory(interp.factory());
const { parseTransform } = interpolateModule.factory(
    lerp, unitsModule.factory(), matrixModule.factory(lerp), colorModule.factory(lerp),
);
// parseTransform(str) => Matrix
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `parseTransform` | `(str: string) => Matrix` | The composed affine matrix |

Supported functions (composed **left-to-right** via `Matrix.multiply`):

| Function | Matrix |
|----------|--------|
| `matrix(a,b,c,d,e,f)` | verbatim 6-tuple |
| `translate(tx[, ty])` | `ty` defaults to `0` |
| `scale(sx[, sy])` | `sy` defaults to `sx` |
| `rotate(deg)` | rotation about the origin |
| `skewX(deg)` | real X-shear: `c = tan(deg)` |
| `skewY(deg)` | real Y-shear: `b = tan(deg)` |

## Examples

```js
parseTransform('translate(10, 20)');         // matrix(1,0,0,1,10,20)
parseTransform('translate(10,20) scale(2)');  // scale applied first
parseTransform('skewX(30)').c;               // tan(30°) ≈ 0.577 (not 0)
```

## Notes

- `skewX`/`skewY` now produce real shear matrices; the first
  spike left them as identity. The shear angle is converted via `tan(deg)`.
- Functions compose **left-to-right** — the leftmost is the outermost transform,
  so `translate(...) scale(...)` applies the scale first.
- `rotate(deg)` rotates about the origin; SVG's optional `cx,cy` centred-rotation
  arguments are ignored (not modelled here).
- An empty or functionless string yields the identity matrix; unrecognised text
  between functions is skipped.

## See also

- [matrix](../math/matrix.md) — the `Matrix` value class and decomposition
- [interpolate](./index.md) — the descriptor that folds and uses `parseTransform`
  for the `transform` kind
