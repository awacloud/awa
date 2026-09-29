---
module: network
category: dom/net
dependencies: []
returns: object
worker-safe: partial
status: complete
---

# network

> Online/offline detection — navigator.onLine + heuristic ping via fetch.

**Module** `network` | **Source** `packages/front/fw/src/dom/net/network.js` | **Deps** none | **Worker-safe** partial

Helpers around `navigator.onLine` and the `online`/`offline` events. Includes an active ping to verify real connectivity (the native flag is notoriously imprecise), a `connection()` snapshot of the Network Information API, and `onConnectionChange()` for connection-quality changes.

## Resolve

```js
const network = runtime.resolve('network');
// Returns: { isOnline, onOnline, onOffline, onChange, connection, onConnectionChange, saveData, ping, off }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isOnline` | `() => boolean` | Current `navigator.onLine` |
| `onOnline` | `(callback: () => void) => () => void` | Unsubscribe |
| `onOffline` | `(callback: () => void) => () => void` | Unsubscribe |
| `onChange` | `(callback: (online: boolean) => void, options?) => () => void` | Unsubscribe |
| `connection` | `() => ConnectionSnapshot \| null` | `navigator.connection` snapshot |
| `onConnectionChange` | `(callback: (snap) => void, opts?) => () => void` | Unsubscribe |
| `saveData` | `() => boolean` | `true` if Data Saver is enabled |
| `ping` | `(url: string, options?) => Promise<boolean>` | `true` if reachable |
| `off` | `() => void` | Removes all listeners |

### `onChange` / `onConnectionChange` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `immediate` | `boolean` | `true` | Calls the callback immediately with the current state |

### `ping` options

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `timeout` | `number` | `3000` | Timeout in ms (AbortController) |
| `method` | `string` | `'HEAD'` | HTTP method |

### `connection()` → `ConnectionSnapshot | null`

Returns `null` if the `navigator.connection` API is absent. Frozen snapshot:

```ts
{
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | null,
  downlink:      number | null,   // Mbps
  rtt:           number | null,   // ms
  saveData:      boolean,
  type:          'wifi' | 'cellular' | ... | null,
}
```

## Examples

### Reacting to online/offline transitions

```js
const network = runtime.resolve('network');

const unsub = network.onChange((online) => {
    document.body.classList.toggle('offline', !online);
    if (online) syncPendingData();
});

window.addEventListener('unload', unsub);
```

### Active check before a critical operation

```js
async function submitForm(data) {
    const alive = await network.ping('/api/healthz', { timeout: 2000 });
    if (!alive) {
        showError('No connection — please try again.');
        return;
    }
    await api.post('/submit', data);
}
```

### Adapting to connection quality

```js
const network = runtime.resolve('network');

const unsub = network.onConnectionChange((snap) => {
    if (!snap) return;
    const isSlowConnection = snap.effectiveType === 'slow-2g' || snap.effectiveType === '2g';
    document.body.classList.toggle('low-quality', isSlowConnection);
    if (snap.saveData) loadLowResImages();
});
```

### One-shot snapshot

```js
const snap = network.connection();
if (snap) {
    console.log(`${snap.effectiveType} — downlink: ${snap.downlink} Mbps, RTT: ${snap.rtt} ms`);
}
if (network.saveData()) {
    console.log('Data Saver enabled — reduce transfers');
}
```

### Global cleanup

```js
// In an SPA, cleanup on navigation
router.on('beforeLeave', () => network.off());
```

## Notes

- `isOnline()` is unreliable — the system can report `true` without real Internet access (local network without a gateway, captive portal). Always validate with `ping` for critical decisions.
- `worker-safe: partial` — `navigator.onLine` and `navigator.connection` are accessible in a Worker, but `online`/`offline` events must be listened on `self` (not `window`).
- `connection()` returns `null` if `navigator.connection` is absent (Firefox 140+, Safari). Test the value before reading its fields.
- `ping` uses `mode: 'no-cors'` — cross-origin requests are possible without CORS but the body is not readable. A non-5xx `status` is sufficient.
- Recommended `ping` target: a lightweight controlled endpoint (e.g. `/healthz`), or a CDN asset.

## See also

- [ajax](./ajax.md) — HTTP requests
- [ws](./ws.md) — persistent WebSocket connection
