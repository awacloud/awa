---
module: gesture
category: dom/query
dependencies: [events]
returns: object
worker-safe: false
status: complete
---

# gesture

> Unified touch/pointer gesture detection (tap, swipe, pan, pinch) via Pointer Events.

**Module** `gesture` | **Source** `packages/front/fw/src/dom/query/gesture.js` | **Deps** `events` | **Worker-safe** no

Built on the W3C Pointer Events API, `gesture` covers mouse, touch, and stylus in a unified way. Simply attach a detector to a DOM element to receive high-level events: `tap`, `doubletap`, `longpress`, `swipe`, `pan`, and `pinch`.

**tap/doubletap decision**: a `tap` is emitted immediately on each fast release. If a second tap occurs within `doubletapMaxMs`, an additional `doubletap` event is emitted on top of the two `tap` events. Consumers that want to ignore `tap` events during a `doubletap` must handle that logic on the application side.

## Resolve

```js
const gesture = runtime.resolve('gesture');
// Returns: { attach }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `attach` | `(el: Element, opts?: AttachOptions) => GestureHandle` | Gesture handle |

### `attach` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `tapMaxMs` | `number` | `250` | Max pointer-down duration to count as a tap. |
| `doubletapMaxMs` | `number` | `300` | Max delay between two taps to trigger a doubletap. |
| `longpressMs` | `number` | `500` | Min duration to trigger a longpress. |
| `swipeMinPx` | `number` | `10` | Min distance (px) for a movement to be a swipe. |
| `swipeMaxMs` | `number` | `300` | Max duration for a movement to count as a swipe. |

### GestureHandle

| Method | Signature | Returns |
|---------|-----------|---------|
| `on` | `(name: EventName, fn: Function) => Function` | Unsubscribe function |
| `off` | `(name: EventName, fn: Function) => void` | — |
| `detach` | `() => void` | Cleans up all DOM listeners |

`EventName` ∈ `'tap'` \| `'doubletap'` \| `'longpress'` \| `'swipe'` \| `'pan'` \| `'pinch'`

### Event payloads

| Event | Payload |
|-----------|---------|
| `tap` | `{x, y, target}` |
| `doubletap` | `{x, y, target}` |
| `longpress` | `{x, y, target, durationMs}` |
| `swipe` | `{direction: 'up'\|'down'\|'left'\|'right', distance, velocityPxPerMs, startX, startY, endX, endY}` |
| `pan` | `{phase: 'start'\|'move'\|'end', dx, dy, totalDx, totalDy, target}` |
| `pinch` | `{phase: 'start'\|'move'\|'end', scale, center: {x, y}, rotation}` |

## Examples

### Basic tap and swipe

```js
const gesture = runtime.resolve('gesture');

const g = gesture.attach(document.querySelector('#card'));

g.on('tap', ({ x, y }) => console.log('tap', x, y));

g.on('swipe', ({ direction, velocityPxPerMs }) => {
    console.log('swipe', direction, velocityPxPerMs.toFixed(2), 'px/ms');
});

// Cleanup when the element is removed from the DOM
g.detach();
```

### Pinch-to-zoom

```js
const gesture = runtime.resolve('gesture');
let scale = 1;

const g = gesture.attach(document.querySelector('#image'));

g.on('pinch', ({ phase, scale: s }) => {
    if (phase === 'move') {
        scale = s;
        document.querySelector('#image').style.transform = `scale(${scale})`;
    }
});
```

### Pan (drag)

```js
const gesture = runtime.resolve('gesture');
let offsetX = 0, offsetY = 0;

const g = gesture.attach(document.querySelector('#draggable'));

g.on('pan', ({ phase, dx, dy }) => {
    if (phase === 'move') {
        offsetX += dx;
        offsetY += dy;
        el.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }
});
```

### Selective unsubscribe

```js
const g = gesture.attach(el);
const off = g.on('longpress', handler);

// Later:
off(); // equivalent to g.off('longpress', handler)
```

## Notes

- `setPointerCapture` is called on each `pointerdown` to guarantee receipt of events even if the cursor leaves the element during a pan or pinch.
- The `longpress` is automatically cancelled if the user moves more than `swipeMinPx` before the timer expires.
- During a `pinch`, `pan` is suspended as soon as the second pointer appears (intentional behaviour to avoid double emission).
- A `tap` and a `doubletap` can coexist: both `tap` events + the `doubletap` are emitted. Consumers that do not want `tap` during a `doubletap` must absorb it themselves.

## See also

- [events](./events.md) — named DOM listener management (direct dependency)
- [dom](./dom.md) — DOM selection and manipulation
- [animate](../display/animate.md) — CSS/JS animations in response to gestures
