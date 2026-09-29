---
module: wakeLock
category: dom/lifecycle
dependencies: [visibility]
returns: object
worker-safe: false
status: complete
---

# wakeLock

> Prevents the screen from sleeping. Auto-reacquire when the tab returns to the foreground.

**Module** `wakeLock` | **Source** `packages/front/fw/src/dom/lifecycle/wakeLock.js` | **Deps** `visibility` | **Worker-safe** no

Wrapper around `navigator.wakeLock.request('screen')`. The spec auto-releases the wake lock when the tab goes `hidden` — this module handles auto-reacquire when the tab becomes `visible` again (option `reacquireOnVisible: true`, default).

## Resolve

```js
const wakeLock = runtime.resolve('wakeLock');
// Returns: { isSupported, acquire }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => boolean` | `'wakeLock' in navigator` |
| `acquire` | `(options?) => Promise<Lock>` | Lock instance |

### Options `acquire`

```js
{ reacquireOnVisible: true }  // (default) re-acquire after returning to visible
```

### Type `Lock`

```js
lock.released                  // boolean — true after release
lock.onRelease(callback)       // called on release — returns unsubscribe
await lock.release()           // manually releases, cleans up visibility listeners
```

## Examples

### Video player / GPS navigation

```js
const wakeLock = runtime.resolve('wakeLock');

if (!wakeLock.isSupported()) {
    console.warn('Wake Lock not supported');
}

const lock = await wakeLock.acquire(); // reacquireOnVisible: true by default

// Cleanup when leaving the feature
document.querySelector('#stop-btn').onclick = async () => {
    await lock.release();
};
```

### Without auto-reacquire

```js
const lock = await wakeLock.acquire({ reacquireOnVisible: false });
lock.onRelease(() => console.log('Screen wake lock released'));
```

### Multiple independent locks

```js
const lock1 = await wakeLock.acquire(); // video player
const lock2 = await wakeLock.acquire(); // GPS navigation

// Release independently
await lock1.release(); // GPS continues
await lock2.release(); // all released
```

## Notes

- **Wake lock auto-released** by the browser when the tab goes `hidden` (spec). `reacquireOnVisible: true` automatically re-acquires when `document.visibilityState` becomes `visible` again.
- **HTTPS required** except localhost.
- Type `'screen'` only — `'system'` is not supported in a browser context.
- `release()` removes visibility listeners and notifies `onRelease` callbacks.
- Use cases: video player, GPS navigation, presentation, games. Always `release()` as soon as possible — battery drain.

## See also

- [visibility](./visibility.md) — manages auto-reacquire internally
- [idle](./idle.md) — detect user inactivity
