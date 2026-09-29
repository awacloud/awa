---
module: easing
category: io/calc
dependencies: []
returns: object
worker-safe: true
status: complete
---

# easing

> Interpolation (easing) functions — 31 implementations of Robert Penner's equations.

**Module** `easing` | **Source** `packages/front/fw/src/io/calc/easing.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const easing = runtime.resolve('easing');
// Returns: object with 31 easing functions
```

## Common signature

All functions follow the Penner convention:

```js
fn(t, b, c, d) → number
```

| Param | Type | Description |
|-------|------|-------------|
| `t` | `number` | Elapsed time (current time) |
| `b` | `number` | Start value (begin) |
| `c` | `number` | Total change = end − start (change) |
| `d` | `number` | Total duration |

## Available functions

| Family | In | Out | InOut |
|--------|----|----|-------|
| **Linear** | `linear` | — | — |
| **Quadratic** | `easeInQuad` | `easeOutQuad` | `easeInOutQuad` |
| **Cubic** | `easeInCubic` | `easeOutCubic` | `easeInOutCubic` |
| **Quartic** | `easeInQuart` | `easeOutQuart` | `easeInOutQuart` |
| **Quintic** | `easeInQuint` | `easeOutQuint` | `easeInOutQuint` |
| **Sinusoidal** | `easeInSine` | `easeOutSine` | `easeInOutSine` |
| **Exponential** | `easeInExpo` | `easeOutExpo` | `easeInOutExpo` |
| **Circular** | `easeInCirc` | `easeOutCirc` | `easeInOutCirc` |
| **Elastic** | `easeInElastic` | `easeOutElastic` | `easeInOutElastic` |
| **Back** | `easeInBack` | `easeOutBack` | `easeInOutBack` |
| **Bounce** | `easeInBounce` | `easeOutBounce` | `easeInOutBounce` |

## Selection guide

| Desired effect | Recommended function |
|----------------|---------------------|
| Natural deceleration | `easeOutCubic` |
| Natural acceleration | `easeInCubic` |
| Acceleration → deceleration | `easeInOutCubic` |
| Bounce on arrival | `easeOutBounce` |
| Overshoot on arrival | `easeOutBack` |
| Elasticity on arrival | `easeOutElastic` |
| Linear | `linear` |

## Examples

```js
const easing = runtime.resolve('easing');

// Interpolate from 0 to 300px over 60 frames
for (let t = 0; t <= 60; t++) {
    const x = easing.easeOutCubic(t, 0, 300, 60);
    el.style.transform = `translateX(${x}px)`;
}

// Usage with the animate module
const animate = runtime.resolve('animate');
animate(500, 'easeOutBounce', { init: 0, end: 100 }, (value) => {
    el.style.top = value + 'px';
});
```

### Reference values — `easeOutCubic(t, 0, 100, 10)`

| t | value |
|---|-------|
| 0 | 0 |
| 3 | ~65.6 |
| 5 | ~87.5 |
| 8 | ~98.8 |
| 10 | 100 |

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const easing = libs.easing;
        const frames = [];
        for (let t = 0; t <= args.duration; t++) {
            frames.push(easing.easeOutCubic(t, 0, args.range, args.duration));
        }
        self.postMessage(frames);
    },
    { dependencies: ['easing'], args: { duration: 60, range: 300 } }
);
```

## Notes

- All functions follow the `(t, b, c, d)` signature (Robert Penner) — `t` can be a frame count or milliseconds depending on what `d` represents.
- Pure functions (no internal timers) — the animation must be driven by `requestAnimationFrame` or an external scheduler.
- `easeInOutCubic` is a good general choice; `easeOutBounce` and `easeOutElastic` are more expensive (conditional computations) but imperceptible at low frequency.

## See also

- [animate](../../dom/display/animate.md) — uses `easing` with `requestAnimationFrame`
