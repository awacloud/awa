---
module: animate
category: dom/display
dependencies: [easing]
returns: function
worker-safe: false
status: complete
---

# animate

> `requestAnimationFrame` animation with interpolation via Penner easing functions.

**Module** `animate` | **Source** `packages/front/fw/src/dom/display/animate.js` | **Deps** `easing` | **Worker-safe** no

## Resolve

```js
const animate = runtime.resolve('animate');
// Returns: function animate(duration, easingName, prop, progress, onComplete?, running?)
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `animate` | `(duration, easingName, prop: {init,end}, progress, onComplete?, running?) => void` | Starts the animation (effects via callbacks) |

### `animate(duration, easingName, prop, progress, onComplete?, running?)`

| Param | Type | Description |
|-------|------|-------------|
| `duration` | `number` | Total duration in milliseconds |
| `easingName` | `string` | Name of an `easing` function (e.g. `'easeOutCubic'`) |
| `prop` | `{ init: number, end: number }` | Start and end values |
| `progress` | `(value, running) → void` | Called each frame with the interpolated value |
| `onComplete` | `() → void` | Called after the last frame (optional) |
| `running` | `() → boolean` | Guard evaluated at the start of each frame; returning `false` cancels (default: `() => true`) |

The `progress` callback also receives the `running` function as its second argument — it can be used to test whether the animation is still active from within.

## Examples

### Simple translation

```js
const animate = runtime.resolve('animate');

animate(
    400,          // 400ms
    'easeOutCubic',
    { init: 0, end: 200 },
    (value) => {
        el.style.transform = `translateX(${value}px)`;
    },
    () => console.log('done')
);
```

### External cancellation

```js
let cancel = false;

animate(
    1000,
    'linear',
    { init: 0, end: 1 },
    (value) => { el.style.opacity = value; },
    null,
    () => !cancel   // return false to cancel
);

// Cancel after 300ms
setTimeout(() => { cancel = true; }, 300);
```

### Animation sequence

```js
const animate = runtime.resolve('animate');

// Chain two animations via onComplete
animate(300, 'easeInCubic', { init: 0, end: 100 }, (v) => {
    el.style.opacity = v / 100;
}, () => {
    animate(300, 'easeOutCubic', { init: 0, end: 200 }, (v) => {
        el.style.transform = `translateY(${v}px)`;
    });
});
```

### Color interpolation (multi-property)

```js
animate(500, 'easeInOutQuad', { init: 0, end: 1 }, (t) => {
    const r = Math.round(255 * (1 - t));
    const g = Math.round(128 * t);
    el.style.backgroundColor = `rgb(${r}, ${g}, 0)`;
});
```

## Notes

- The first frame (elapsed = 0) is **skipped** — `progress` is not called before the second tick; the starting value is the state already in place.
- Invalid values for `duration`, `easingName`, `prop`, `progress` throw a `TypeError` **synchronously** before the first `requestAnimationFrame`.
- `requestAnimationFrame` is not available in workers — this module is DOM-only.
- To chain animations, use the `onComplete` callback rather than `setTimeout`.

## See also

- [easing](../../io/calc/easing.md) — complete list of easing functions
- [fullscreen](./fullscreen.md)
