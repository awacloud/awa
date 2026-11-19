# DOM / SW

Service Worker lifecycle + Cache API.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [backgroundSync](./backgroundSync.md) | `{register, list, support}` | `serviceWorker` | Background Sync API — offline replay via SyncManager (Chrome only) |
| [cache](./cache.md) | `{open, delete, has, keys, match}` | none | Cache API wrapper |
| [installPrompt](./installPrompt.md) | `{install, launchQueue}` | none | PWA install prompt deferral + File Handling launch queue |
| [precache](./precache.md) | `{create, DEFAULT_MESSAGES}` | `cache` | Worker-side release precache + cache-first / network-first strategies |
| [push](./push.md) | `{subscribe, unsubscribe, current, permission, support}` | `serviceWorker`, `b64` | PushManager wrapper — VAPID subscription, permission |
| [serviceWorker](./serviceWorker.md) | `{register, unregister, ready, update, onUpdate, postMessage, onMessage, controller, isSupported}` | none | SW lifecycle (window-side) |
| [sharedWorker](./sharedWorker.md) | `{create, support}` | `processRPC` | SharedWorker cross-tab connection + bidirectional RPC |
| [swUpdate](./swUpdate.md) | `{create, DEFAULT_MESSAGES}` | `serviceWorker` | Waiting-release update flow: report once, check, apply, version |

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

// Or the waiting-release flow: report once, apply on the user's word
const updates = await runtime.resolve('swUpdate').create({ swUrl: '/sw.js', onUpdateReady: showBanner });

// Use the cache
const c = await cache.open('v1');
await c.put('/api/data', response);
const cached = await c.match('/api/data');
```
