---
module: serviceWorker
category: dom/sw
dependencies: []
returns: object
worker-safe: false
status: complete
---

# serviceWorker

> Service Worker lifecycle helpers (window-side) — register, update, messages.

**Module** `serviceWorker` | **Source** `packages/front/fw/src/dom/sw/serviceWorker.js` | **Deps** none | **Worker-safe** no

Wrapper around `navigator.serviceWorker`. **Window side only** — for logic inside the SW itself, write directly in the SW `.js` script. Requires HTTPS (or localhost).

## Resolve

```js
const serviceWorker = runtime.resolve('serviceWorker');
// Returns: { register, unregister, ready, update, onUpdate, postMessage, onMessage, controller, isSupported }
```

## API

| Method / Property | Signature | Returns |
|---------------------|-----------|---------|
| `register` | `(scriptUrl: string, options?) => Promise<ServiceWorkerRegistration>` | SW registration |
| `unregister` | `(scope?: string) => Promise<boolean>` | `true` if unregistered |
| `ready` | `() => Promise<ServiceWorkerRegistration>` | Wait for active SW |
| `update` | `(scope?: string) => Promise<void>` | Force update check |
| `onUpdate` | `(callback: (reg) => void) => () => void` | New SW waiting; returns unsubscribe |
| `postMessage` | `(data: any) => void` | Send to the active controller |
| `onMessage` | `(callback: (data) => void) => () => void` | Receive messages from SW; returns unsubscribe |
| `controller` | `getter: ServiceWorker \| null` | Active SW controller |
| `isSupported` | `() => boolean` | `navigator.serviceWorker` present |

### Options `register`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `scope` | `string` | `'/'` | SW scope |
| `type` | `'classic' \| 'module'` | `'classic'` | Script type |
| `updateViaCache` | `'imports' \| 'all' \| 'none'` | `'imports'` | Cache strategy |

## Examples

### Registration and update

```js
const serviceWorker = runtime.resolve('serviceWorker');

if (serviceWorker.isSupported()) {
    const reg = await serviceWorker.register('/sw.js', { scope: '/' });
    console.log('SW registered:', reg.scope);

    serviceWorker.onUpdate((reg) => {
        // Offer the user a page reload
        if (confirm('Update available. Reload?')) location.reload();
    });
}
```

### Window ↔ SW communication

```js
// Send a message to the SW
serviceWorker.postMessage({ cmd: 'skipWaiting' });

// Receive messages from the SW
const unsub = serviceWorker.onMessage((data) => {
    if (data.type === 'CACHE_UPDATED') refreshUI();
});

window.addEventListener('unload', unsub);
```

## Notes

- Requires **HTTPS** (or `localhost`). On HTTP, `navigator.serviceWorker` is `undefined`.
- `postMessage` throws if `controller` is `null` (SW not yet active after registration).
- For cross-tab communication via SW: combine with [`broadcastChannel`](../net/broadcastChannel.md).
- `onUpdate` detects the `updatefound` event on the registration — the new SW is in the `installing` state.
- `unregister(scope)` looks up the registration by scope. Without an argument, deactivates all.

## See also

- [cache](./cache.md) — Cache API (usable SW-side and window-side)
- [broadcastChannel](../net/broadcastChannel.md) — alternative cross-tab communication
