---
module: graphic.units
category: math
type: lib.graphic.math
dependencies: []
returns: object
worker-safe: true
status: complete
---

# graphic.units

> CSS unit split and format — parse `"50px"` and round-trip back to string.

**Descriptor** `unitsModule` | **Name** `graphic.units` | **Type** `lib.graphic.math` | **Source** `packages/front/graphic/anim/src/math/units.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
// Via fw runtime (after registering graphicModules):
const units = runtime.resolve('graphic.units');
// units.split('50px') => { value: 50, unit: 'px' }

// Direct (standalone / test):
import { unitsModule } from '@awacloud/graphic-anim';
const units = unitsModule.factory();
```

## Descriptor shape

```js
import { unitsModule } from '@awacloud/graphic-anim';

unitsModule.name;          // 'graphic.units'
unitsModule.type;          // 'lib.graphic.math'
unitsModule.version;       // '0.1.0'
unitsModule.dependencies;  // []
unitsModule.deps;          // []
unitsModule.factory();     // { split, format }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `units.split` | `(input: string \| number) => UnitValue` | `{ value: number, unit: string }` |
| `units.format` | `(value: number, unit: string) => string` | e.g. `"50px"` |

**`UnitValue`**: `{ value: number, unit: string }` — `unit` is `''` for bare numbers.

## Examples

```js
import { unitsModule } from '@awacloud/graphic-anim';

const units = unitsModule.factory();

units.split('50px');    // { value: 50, unit: 'px' }
units.split('.5em');    // { value: 0.5, unit: 'em' }
units.split('100%');    // { value: 100, unit: '%' }
units.split('1e3px');   // { value: 1000, unit: 'px' }
units.split(42);        // { value: 42, unit: '' }

units.format(50, 'px');  // '50px'
units.format(1/3, 'rem'); // '0.333333rem'

// Round-trip
const { value, unit } = units.split('75.5vh');
units.format(value, unit); // '75.5vh'
```

## Worker Usage

```js
// graphic.units is pure string arithmetic — Worker-safe.
import { unitsModule } from '@awacloud/graphic-anim';
const units = unitsModule.factory();
const parsed = units.split('200ms');  // { value: 200, unit: 'ms' }
```

## Notes

- `split` throws `Error` on unparseable input (e.g. `"abc"`); use a try/catch for untrusted input.
- `format` rounds to 1e-6 precision to suppress floating-point noise from intermediate arithmetic.
- Regex: `/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i` — covers CSS numeric literals including scientific notation.

## See also

- [scalar](./scalar.md) — `lerp` for numeric value interpolation
- [easing](./easing.md) — normalized Penner easing curves
