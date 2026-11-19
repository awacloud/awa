---
module: graphic.color
category: math
dependencies: [graphic.lerp]
returns: object
worker-safe: true
status: complete
---

# graphic.color

> CSS colour parse / lerp / format — capture-free fw module descriptor.

**Module** `graphic.color` | **Source** `packages/front/graphic/anim/src/math/color.js` | **Deps** `graphic.lerp` | **Worker-safe** yes

> **Beyond the first draft**: the engine's first draft covered only `#hex` and
> `rgb()`/`rgba()`. This module adds `hsl()`/`hsla()` parsing (HSL→RGB standard
> algorithm) and the full 148 CSS Color Module Level 4 named colours plus
> `transparent` (via the resolved `CSS_NAMED_COLORS` frozen lookup table).

## Descriptor shape

```js
import { colorModule } from '@awacloud/graphic-anim';

// colorModule = {
//   name: 'graphic.color',
//   type: 'lib.graphic.color',
//   version: '0.1.0',
//   dependencies: ['graphic.lerp'],
//   deps: [lerpModule],
//   factory(lerp) => { parse, lerp, format, CSS_NAMED_COLORS }
// }
```

Note: the factory param is named `lerp` (the injected scalar lerp function); the
resolved object's `lerp` METHOD is the colour RGBA-lerp — different scopes, no collision.

## Resolve

```js
import { lerpModule } from '@awacloud/graphic-anim';
import { colorModule } from '@awacloud/graphic-anim';

// Manual resolution (no runtime):
const lerp = lerpModule.factory(interp.factory());
const { parse, lerp: colorLerp, format, CSS_NAMED_COLORS } = colorModule.factory(lerp);

// Via fw ModuleRuntime:
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { interp } from '@awacloud/fw/io/math/interp.js';
const rt = new ModuleRuntime();
rt.registerDeep(colorModule);
const color = rt.resolve('graphic.color');
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(input: string) => Rgba` | RGBA tuple |
| `lerp` | `(from: string, to: string, t: number) => string` | CSS colour string |
| `format` | `(c: Rgba) => string` | CSS colour string |
| `CSS_NAMED_COLORS` | `Readonly<Record<string, string>>` | 149-entry frozen lookup (148 CSS L4 + transparent) |

**Typedef**

```js
/** @typedef {{ r:number, g:number, b:number, a:number }} Rgba  // r,g,b 0..255; a 0..1 */
```

### `parse(input)`

Accepts:
- `#rgb`, `#rrggbb`, `#rrggbbaa` hex (case-insensitive)
- `rgb(r, g, b)` / `rgba(r, g, b, a)`
- `hsl(h, s%, l%)` / `hsla(h, s%, l%, a)` — converted via the standard HSL→RGB algorithm (chroma method)
- Any of the 148 CSS Color Level 4 named keywords (case-insensitive), including `transparent` (alpha 0)

Throws `Error` on an unrecognised or malformed input.

### `lerp(from, to, t)`

Parses both inputs and interpolates RGBA channels (including alpha) linearly at progress `t`. Interpolation is always in RGBA space — it does **not** lerp in HSL even when inputs are HSL strings. Output is always `rgb()`/`rgba()`.

### `format(c)`

Clamps `r`/`g`/`b` to [0, 255] and rounds to integer; clamps `a` to [0, 1] and rounds to 3 decimal places (1e-3). Returns `rgb(r, g, b)` when `a >= 1`, otherwise `rgba(r, g, b, a)`.

## Examples

```js
import { lerpModule } from '@awacloud/graphic-anim';
import { colorModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

const lerp = lerpModule.factory(interp.factory());
const { parse, lerp: colorLerp, format, CSS_NAMED_COLORS } = colorModule.factory(lerp);

// Parse hex
parse('#ff0000');               // { r: 255, g: 0, b: 0, a: 1 }

// Parse hsl
parse('hsl(240, 100%, 50%)');   // { r: 0, g: 0, b: 255, a: 1 }

// Parse named
parse('rebeccapurple');         // { r: 102, g: 51, b: 153, a: 1 }
parse('transparent');           // { r: 0, g: 0, b: 0, a: 0 }

// Lerp two colours
colorLerp('#ff0000', 'blue', 0.5);  // 'rgb(128, 0, 128)'
colorLerp('red', 'transparent', 0.5); // 'rgba(128, 0, 0, 0.5)'

// Format
format({ r: 255, g: 0, b: 0, a: 1 });    // 'rgb(255, 0, 0)'
format({ r: 255, g: 0, b: 0, a: 0.5 });  // 'rgba(255, 0, 0, 0.5)'

// Named colour lookup table
CSS_NAMED_COLORS['gold'];  // '#ffd700'
```

## Worker Usage

```js
// color is pure arithmetic — safe to use in any Worker.
import { lerpModule } from '@awacloud/graphic-anim';
import { colorModule } from '@awacloud/graphic-anim';
import { interp } from '@awacloud/fw/io/math/interp.js';

const lerp = lerpModule.factory(interp.factory());
const { parse, lerp: colorLerp, format } = colorModule.factory(lerp);
```

## Notes

- **Capture-free descriptor**: `CSS_NAMED_COLORS`, `hslToRgba`, and all color
  methods are defined INSIDE `factory(lerp)`. The `lerp` parameter is the
  injected scalar lerp; the returned object's `lerp` method (colour RGBA-lerp)
  is a separate function with a different scope — no collision.
- Interpolation is **always RGBA** regardless of input syntax. Lerping between two HSL strings does not produce a perceptually uniform hue path — it produces a straight-line RGBA blend. This is intentional: gamut-neutral, predictable, zero-extra-cost.
- `CSS_NAMED_COLORS` is a frozen object — mutation attempts are silently ignored in strict mode. Use it for fast `O(1)` named-colour lookups.
- `transparent` maps to `#00000000` (black with alpha 0), matching the CSS specification.
- Alpha in `#rrggbbaa` hex is 8-bit (0–255 divided by 255); the value is **not** rounded in `parse` — rounding only happens in `format`.
- The HSL sector algorithm follows the standard IEC/CSS chroma method: `c = (1 - |2L−1|) × S`, `x = c × (1 - |(H/60) mod 2 − 1|)`.

## See also

- [scalar](./scalar.md) — `graphic.lerp` descriptor, the injected dependency
- [units](./units.md) — CSS unit split/format companion
- [easing](./easing.md) — reshapes the `t` clock before it reaches the lerp
