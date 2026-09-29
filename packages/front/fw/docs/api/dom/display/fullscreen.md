---
module: fullscreen
category: dom/display
dependencies: []
returns: object
worker-safe: false
status: complete
---

# fullscreen

> Fullscreen mode management — enter, exit, toggle, and state change listeners.

**Module** `fullscreen` | **Source** `packages/front/fw/src/dom/display/fullscreen.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const fullscreen = runtime.resolve('fullscreen');
// Returns: { isSupported, isFullscreen, enter, exit, toggle, listen }
```

## API

| Method | Signature | Description |
|---------|-----------|-------------|
| `isSupported` | `() → boolean` | Checks availability of the Fullscreen API |
| `isFullscreen` | `() → boolean` | Current fullscreen state |
| `enter` | `(source?) → Promise<void>` | Enter fullscreen |
| `exit` | `() → Promise<void>` | Exit fullscreen |
| `toggle` | `(source?) → Promise<void>` | Toggle state |

### `source` — element resolution

- `Event` → uses `event.currentTarget` (then `event.target` as fallback)
- `Element` → used directly
- `undefined` → `document.documentElement`

Passing the click event is recommended — browsers require that entering fullscreen is triggered from a user gesture.

### `listen` — state change callbacks

```js
fullscreen.listen.add('myListener', (isFullscreen) => {
    console.log('fullscreen:', isFullscreen);
});

fullscreen.listen.del('myListener');
```

Callbacks are called in registration order on each `fullscreenchange` event.

### `fullscreen.dispose()`

Removes all registered callbacks and detaches the `fullscreenchange` listener from the document. Call on scope or page teardown to prevent leaks.

```js
fullscreen.dispose();
```

## Examples

### Simple fullscreen button

```js
const fullscreen = runtime.resolve('fullscreen');
const events     = runtime.resolve('events');

if (fullscreen.isSupported()) {
    events.on('fsBtn', btn, 'click', (e) => {
        fullscreen.toggle(e);
    });

    fullscreen.listen.add('stateChange', (active) => {
        btn.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    });
}
```

### Fullscreen on a specific element

```js
const videoEl = document.querySelector('video');

events.on('videoClick', videoEl, 'dblclick', (e) => {
    if (fullscreen.isFullscreen()) {
        fullscreen.exit();
    } else {
        fullscreen.enter(videoEl);
    }
});
```

### Cleanup

```js
function mountPlayer() {
    fullscreen.listen.add('playerFs', (active) => updateUI(active));
    events.on('playerBtn', fsBtn, 'click', (e) => fullscreen.toggle(e));

    return function unmount() {
        fullscreen.listen.del('playerFs');
        events.off('playerBtn');
        if (fullscreen.isFullscreen()) fullscreen.exit();
    };
}
```

## Notes

- Entering fullscreen must be triggered from a user gesture handler (`click`, `keydown`, etc.).
- `enter()` and `toggle()` return Promises — errors (user refusal, invalid element) can be caught.
- The `fullscreenchange` listener is attached **lazily** on the first `listen.add()` and detached when `listen.del()` empties the set — no leak if no one is subscribed.
- `dispose()` must be called on teardown to release callbacks and the document listener.
- **Compatibility**: Standard Chrome 71+, Firefox 64+, Edge 79+, Safari 16.4+. Webkit prefix for Safari < 16.4 (supported internally via fallback).

## See also

- [animate](./animate.md)
- [events](../query/events.md)
- [media](../query/media.md) — video capture often combined with fullscreen
