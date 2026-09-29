---
module: backgroundSync
category: dom/sw
dependencies: [serviceWorker]
returns: object
worker-safe: false
status: complete
---

# backgroundSync

> Background Sync API — offline-first task registration via SyncManager.

**Module** `backgroundSync` | **Source** `packages/front/fw/src/dom/sw/backgroundSync.js` | **Deps** `serviceWorker` | **Worker-safe** no

Wrapper around the [W3C Background Sync API](https://wicg.github.io/background-sync/spec/) (supported by Chrome/Chromium only at this date). Allows registering sync tags: the browser fires the `sync` event in the Service Worker once network connectivity is deemed sufficient. Designed for reliable offline replay (e.g. form submission, deferred upload).

The module operates **page-side** (`main thread`) via the `ServiceWorkerRegistration`. The `sync` event handler belongs to the Service Worker itself — see the complete example below.

## Resolve

```js
const backgroundSync = runtime.resolve('backgroundSync');
// Returns: { register, list, support }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `register` | `(tag: string) => Promise<void>` | Registers a sync tag; throws `BackgroundSyncNotSupported` if unavailable |
| `list` | `() => Promise<string[]>` | Currently registered sync tags |
| `support` | `() => { available: boolean, sw: boolean }` | Synchronous support detection |

### `backgroundSync.register(tag)`

Registers a tag with `SyncManager`. The SW will receive `self.addEventListener('sync', event => event.tag === tag)` when the browser estimates connectivity is restored.

- Throws `BackgroundSyncNotSupported` (`.name === 'BackgroundSyncNotSupported'`) if `SyncManager` is absent from the `ServiceWorkerRegistration`.
- Idempotent: calling with the same tag twice has no effect.

### `backgroundSync.list()`

Returns pending tags via `SyncManager.getTags()`. Useful for avoiding duplicate registrations.

### `backgroundSync.support()`

Synchronous **preliminary** detection:

| Field | Meaning |
|-------|--------------|
| `sw` | `navigator.serviceWorker` is present |
| `available` | `sw && typeof SyncManager !== 'undefined'` (heuristic — Chrome only) |

Does not guarantee that `SyncManager` is effectively accessible via the active registration; use `register()` with `BackgroundSyncNotSupported` error handling for definitive detection.

## Examples

### Register a tag with support check

```js
const backgroundSync = runtime.resolve('backgroundSync');

const { available } = backgroundSync.support();
if (available) {
    try {
        await backgroundSync.register('sync-uploads');
        console.log('Tag registered');
    } catch (err) {
        if (err.name === 'BackgroundSyncNotSupported') {
            // Fallback: retry on online event
            window.addEventListener('online', retryUploads, { once: true });
        } else {
            throw err;
        }
    }
} else {
    window.addEventListener('online', retryUploads, { once: true });
}
```

### Complete pattern with SW handler + online fallback

**Page (main thread):**

```js
const backgroundSync = runtime.resolve('backgroundSync');
const serviceWorker  = runtime.resolve('serviceWorker');

async function scheduleSyncOrFallback(tag, fallback) {
    const { available } = backgroundSync.support();
    if (available) {
        try {
            await backgroundSync.register(tag);
            return; // the SW will take over
        } catch (err) {
            if (err.name !== 'BackgroundSyncNotSupported') throw err;
        }
    }
    // Fallback: replay on next connection
    window.addEventListener('online', fallback, { once: true });
}

await scheduleSyncOrFallback('sync-comments', () => fetch('/api/comments', { method: 'POST', body: pendingData }));
```

**Service Worker (`/sw.js`):**

```js
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-comments') {
        event.waitUntil(replayPendingComments());
    }
});

async function replayPendingComments() {
    const pending = await getFromIndexedDB('pending-comments');
    for (const item of pending) {
        await fetch('/api/comments', { method: 'POST', body: JSON.stringify(item) });
        await removeFromIndexedDB('pending-comments', item.id);
    }
}
```

### List pending tags

```js
const backgroundSync = runtime.resolve('backgroundSync');
const pending = await backgroundSync.list();
console.log('Pending tags:', pending);
// ['sync-uploads', 'sync-comments']
```

## Notes

- Limited browser support: Chrome/Chromium 49+ only as of the module date (May 2026). Firefox and Safari do not support the one-shot Background Sync API. Check [caniuse.com/background-sync](https://caniuse.com/background-sync) for current status.
- The recommended fallback on unsupported browsers is the `window.online` event + manual retry — simpler, but without delivery guarantee outside the session.
- `SyncManager` is only available if the page is served over HTTPS (or `localhost`). A SW registered over HTTP will never receive the `sync` event.
- Periodic Background Sync (`PeriodicSyncManager`) is a distinct API, out of scope for this module.

## See also

- [serviceWorker](./serviceWorker.md) — Service Worker registration and lifecycle
- [cache](./cache.md) — HTTP response caching SW-side
- [network](../net/network.md) — online/offline detection page-side
