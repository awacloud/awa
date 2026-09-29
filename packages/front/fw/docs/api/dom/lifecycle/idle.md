---
module: idle
category: dom/lifecycle
dependencies: []
returns: object
worker-safe: false
status: complete
---

# idle

> IdleDetector (Chrome 94+) with cross-browser timer-based fallback.

**Module** `idle` | **Source** `packages/front/fw/src/dom/lifecycle/idle.js` | **Deps** none | **Worker-safe** no

Detects user inactivity. Prefers the native API (`IdleDetector`) when available. Timer-based fallback for other browsers.

## Resolve

```js
const idle = runtime.resolve('idle');
// Returns: { isSupported, requestPermission, create, fallback }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `typeof IdleDetector !== 'undefined'` |
| `requestPermission` | `() => Promise<'granted'|'denied'>` | Required before `create()` |
| `create` | `({ threshold }) => Promise<Detector>` | Native IdleDetector |
| `fallback` | `({ threshold, events }) => Detector` | Timer-based |

### `Detector` (create and fallback)

```js
detector.userState    // 'active' | 'idle'
detector.screenState  // 'locked' | 'unlocked' (create only)
detector.onChange(callback)  // callback({ userState, screenState? }) — returns unsubscribe
await detector.start()
detector.stop()
```

## Examples

### Recommended: auto-fallback

```js
const idle = runtime.resolve('idle');

let detector;
if (idle.isSupported()) {
    const perm = await idle.requestPermission();
    if (perm === 'granted') {
        detector = await idle.create({ threshold: 60_000 });
    }
}
detector = detector ?? idle.fallback({ threshold: 60_000 });
detector.onChange(({ userState }) => {
    if (userState === 'idle') pauseAutoSave();
    else resumeAutoSave();
});
await detector.start();
```

### Fallback only (cross-browser)

```js
const f = idle.fallback({
    threshold: 120_000,  // 2 minutes
    events: ['mousemove', 'keydown', 'touchstart', 'scroll'],
});
f.onChange(({ userState }) => console.log('User is', userState));
f.start();
// Later: f.stop();
```

## Notes

- `idle.create()`: **Chrome 94+ only**. Throws if not supported → use `fallback`.
- `IdleDetector` requires `requestPermission()` AND HTTPS.
- Minimum `threshold`: **60 000 ms** (1 minute) per the IdleDetector spec. The fallback accepts lower values.
- `fallback.stop()` cleans up all event listeners and clearTimeout — no leak.
- Cross-browser recommendation: always have a fallback ready.

## See also

- [visibility](./visibility.md) — tab visibility (simpler and more reliable)
- [wakeLock](./wakeLock.md) — prevent screen sleep
