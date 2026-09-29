# DOM / SW

Service Worker lifecycle + Cache API.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [backgroundSync](./backgroundSync.md) | `{register, list, support}` | `serviceWorker` | Background Sync API — offline replay via SyncManager (Chrome only) |
| [cache](./cache.md) | `{open, delete, has, keys, match}` | none | Cache API wrapper |
| [serviceWorker](./serviceWorker.md) | `{register, unregister, ready, update, onUpdate, postMessage, onMessage, controller, isSupported}` | none | SW lifecycle (window-side) |
| [push](./push.md) | `{subscribe, unsubscribe, current, permission, support}` | `serviceWorker`, `b64` | PushManager wrapper — VAPID subscription, subscription, permission |
| [sharedWorker](./sharedWorker.md) | `{create, support}` | `processRPC` | SharedWorker cross-tab connection + bidirectional RPC |

## Common pattern

```js
const serviceWorker = runtime.resolve('serviceWorker');
const cache = runtime.resolve('cache');

// Register the SW
await serviceWorker.register('/sw.js', { scope: '/' });

// React to updates
serviceWorker.onUpdate((reg) => {
    console.log('New SW waiting:', reg.waiting);
});

// Use the cache
const c = await cache.open('v1');
await c.put('/api/data', response);
const cached = await c.match('/api/data');
```
