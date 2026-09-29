---
module: visibility
category: dom/lifecycle
dependencies: []
returns: object
worker-safe: false
status: complete
---

# visibility

> Wrapper around `document.visibilityState` + `visibilitychange`.

**Module** `visibility` | **Source** `packages/front/fw/src/dom/lifecycle/visibility.js` | **Deps** none | **Worker-safe** no

Observes tab visibility. Extremely reliable — supported everywhere (MDN: Chrome 33+, Firefox 18+, Safari 6.1+). Useful for pausing expensive tasks (timers, animations, requests) when the tab is in the background.

## Resolve

```js
const visibility = runtime.resolve('visibility');
// Returns: { isSupported, state, isVisible, isHidden, onChange, onVisible, onHidden }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `'visibilityState' in document` |
| `state` | `() => string` | `'visible'` / `'hidden'` |
| `isVisible` | `() => boolean` | `state() === 'visible'` |
| `isHidden` | `() => boolean` | `state() === 'hidden'` |
| `onChange` | `(callback, options?) => stop` | stop fn |
| `onVisible` | `(callback) => stop` | stop fn (visible filter) |
| `onHidden` | `(callback) => stop` | stop fn (hidden filter) |

### Options `onChange`

```js
{ immediate: true }  // (default) calls callback immediately with the current state
```

## Examples

```js
const visibility = runtime.resolve('visibility');

// Pause/resume an interval
const stopVisibility = visibility.onChange(state => {
    if (state === 'hidden') pauseAnimationLoop();
    else resumeAnimationLoop();
});

// Watch only for returning to foreground
const stopVisible = visibility.onVisible(() => {
    refreshData();
});

// Cleanup
stopVisibility();
stopVisible();
```

## Notes

- `onChange` with `immediate: true` (default) calls the callback synchronously at subscription time with the current state — no intermediate state missed.
- `onHidden` does not call the callback immediately even if the state is already `hidden` (intentional — no destructive action on mount).
- Each `onChange`/`onVisible`/`onHidden` is independent — multiple simultaneous listeners are supported.

## See also

- [idle](./idle.md) — user inactivity detection
- [wakeLock](./wakeLock.md) — prevent screen sleep (observes `visibility` internally)
