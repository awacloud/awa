---
module: anim/tween
category: anim
name: graphic.tween
type: fw.dom.graphic
dependencies: [graphic.scheduler, graphic.easing, graphic.interpolate, graphic.svgApply]
returns: "{ Tween, tween, resolveEasing }"
worker-safe: false
status: complete
---

# anim/tween — `graphic.tween`

> Reference-bound single-property tween driven by the shared scheduler.

**Module** `graphic.tween` | **Type** `fw.dom.graphic` | **Source** `packages/front/graphic/anim/src/anim/tween.js` | **Deps** `graphic.scheduler`, `graphic.easing`, `graphic.interpolate`, `graphic.svgApply` | **Worker-safe** no

## Descriptor

`graphic.tween` is one capture-free fw module descriptor. Its factory receives the
four resolved dependencies as parameters and returns `{ Tween, tween, resolveEasing }`; the
`Tween` class is defined **inside** the factory so it references the injected
dependencies — never a module-scope binding (`fw/no-factory-capture` clean).

```js
export const tweenModule = {
    name: 'graphic.tween',
    type: 'fw.dom.graphic',
    version: '0.1.0',
    dependencies: ['graphic.scheduler', 'graphic.easing', 'graphic.interpolate', 'graphic.svgApply'],
    deps: [schedulerModule, easingModule, interpolateModule, svgApplyModule],
    factory(scheduler, easing, interpolate, svgApply) { /* … */ return { Tween, tween, resolveEasing }; },
};
```

`deps.map(d => d.name) === dependencies` (same order). The factory wires every
capability through its parameters:

| Param | Resolved from | Used for |
|-------|---------------|----------|
| `scheduler` | `graphic.scheduler` → `{ Scheduler, scheduler }` | default registration target = the shared `scheduler.scheduler` singleton |
| `easing` | `graphic.easing` → curve table | the first source of `resolveEasing` (then the CSS timing functions); a spec that does not resolve throws |
| `interpolate` | `graphic.interpolate` → `{ interpolator, … }` | build the `from`→`to` blender once via `interpolate.interpolator` |
| `svgApply` | `graphic.svgApply` → `{ SVG_NS, svgAttr }` | default writer = `svgApply.svgAttr(target, property, value)` |

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `Tween` | `class Tween(opts: TweenOptions)` | Animate one property of one target over a duration. |
| `Tween#play` | `() => this` | Register with the scheduler (starts the shared loop if idle). |
| `Tween#done` | `boolean` | True once progress has reached 1. |
| `Tween#value` | `string\|number` | The last value written (`from` before the first tick). |
| `Tween#target` / `#property` / `#duration` / `#ease` | (read) | The bound target, the property, the duration in ms (at least 1), the resolved curve. |
| `tween` | `(opts: TweenOptions) => Tween` | Convenience: `new Tween(opts).play()`. |
| `resolveEasing` | `(spec?) => (t) => number` | Turn an easing spec into a curve (see [Easing specs](#easing-specs)). |

### `TweenOptions`

| Field | Type | Description |
|-------|------|-------------|
| `target` | `object` | Element/object to mutate — bound BY REFERENCE once. |
| `property` | `string` | Attribute/property name to animate. |
| `from` / `to` | `string\|number` | Start (`t=0`) / end (`t=1`) values. |
| `duration` | `number` | Duration in ms (coerced to a positive minimum). |
| `easing` | `((t)=>number)\|string` | An easing spec (below); defaults `linear`; an unknown spec throws `Tween: unknown easing "<spec>"`. |
| `apply` | `(value, target) => void` | Writer; defaults to `svgApply.svgAttr(target, property, value)`. |
| `onUpdate` | `(value) => void` | Fired every tick. |
| `onComplete` | `() => void` | Fired once when progress reaches 1. |
| `scheduler` | `Scheduler` | Override the shared scheduler instance (tests / timelines). |

### Easing specs

`easing` (and `resolveEasing`) accept, in this order:

1. a function `(t) => number`, used as is;
2. `undefined` or `null`: `linear`;
3. a name in the 31-curve table ([math/easing](../math/easing.md)) — the table
   keeps priority;
4. a CSS timing function: `cubic-bezier(x1, y1, x2, y2)` (x1 and x2 in
   `[0, 1]`, else it throws), `steps(n[, jump-start | jump-end | jump-none |
   jump-both | start | end])` (default `jump-end`), or one of the keywords
   `ease`, `ease-in`, `ease-out`, `ease-in-out`, `step-start`, `step-end`.

```js
tween({ target: el, property: 'opacity', from: 0, to: 1, duration: 400, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
tween({ target: el, property: 'opacity', from: 1, to: 0.2, duration: 90, easing: 'steps(1, end)' }); // hold, then jump
```

`cubic-bezier` solves the curve's `x(s) = t` for the parameter `s` (Newton,
then bisection) and returns `y(s)`; it agrees with the parametric curve to
1e-6. `steps` follows the CSS step positions.

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { tweenModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(tweenModule);                 // pulls all transitive deps + fw dom/secPolicy
const { tween, Tween } = runtime.resolve('graphic.tween');
const { SVG_NS } = runtime.resolve('graphic.svgApply');

const rect = document.createElementNS(SVG_NS, 'rect');

// Convenience: build + play on the shared scheduler.
tween({ target: rect, property: 'width', from: 0, to: 100, duration: 1000,
        easing: 'easeInOutQuad', onComplete: () => console.log('done') });

// Or construct and play explicitly.
new Tween({ target: rect, property: 'opacity', from: 1, to: 0, duration: 500 }).play();
```

## Notes

- **Reference-bound target**: the target is captured once at construction — there is
  **no per-tick `getElementById`/DOM lookup** (the legacy O(n)/frame cost the rewrite
  removes). The default `apply` writes through the bound target.
- Easing specs resolve through `resolveEasing`: the injected `graphic.easing` table
  first, then the CSS timing functions; a spec that does not resolve throws at
  construction. An absent easing is `linear`; a function is used as-is.
- The interpolator is built **once** from `from`→`to` (via the injected
  `graphic.interpolate`). Raw progress is clamped to `[0, 1]`; on completion the tween
  sets `done`, removes itself from the scheduler, and fires `onComplete`.
- **Secure-writer routing**: the default writer goes through `svgApply.svgAttr`, which
  delegates to the fw `dom.attr` path. **Sanitization scope (accurate)**: `dom.attr`
  writes via raw `setAttribute` — it does **not** invoke secPolicy sanitization. Only
  `dom.style`/visibility paths sanitize through secPolicy. Do not assume tween-written
  attribute values are filtered for XSS/injection beyond what `setAttribute` enforces.
- **Not Worker-safe** (the default writer mutates a DOM target) and **no Worker by
  default**.

## See also

- [anim/scheduler](./scheduler.md) — the shared rAF loop driving this tween
- [anim/timeline](./timeline.md) — composes tweens into sequences/parallels/staggers
- [svg/apply](../svg/apply.md) — the injected `svgApply.svgAttr` writer
- [interpolate](../interpolate/index.md) — builds the `from`→`to` blender
