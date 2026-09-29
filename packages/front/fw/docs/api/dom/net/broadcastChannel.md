---
module: broadcastChannel
category: dom/net
dependencies: []
returns: object
worker-safe: true
status: complete
---

# broadcastChannel

> BroadcastChannel — cross-tab / cross-worker communication within the same origin.

**Module** `broadcastChannel` | **Source** `packages/front/fw/src/dom/net/broadcastChannel.js` | **Deps** none | **Worker-safe** yes

Minimal wrapper around the native `BroadcastChannel` API. Enables communication between tabs, workers, and service workers sharing the same origin. For command-based routing, see [`processMessage`](../../process/README.md).

## Resolve

```js
const broadcastChannel = runtime.resolve('broadcastChannel');
// Returns: { create, isSupported }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `create` | `(name: string) => Channel` | Channel instance |
| `isSupported` | `() => boolean` | `true` if `BroadcastChannel` is available |

### `Channel` object

| Method / Property | Signature | Description |
|---------------------|-----------|-------------|
| `post` | `(data: any) => void` | Sends a message (structured-cloneable) |
| `on` | `(callback: (data, event) => void) => () => void` | Adds a listener; returns unsubscribe |
| `off` | `(callback) => void` | Removes a listener |
| `close` | `() => void` | Closes the channel and removes all listeners |
| `name` | `getter: string` | Channel name |

**Semantics**:
- `post` is **not** received by the same instance — only by other instances with the same name.
- Each call to `create(name)` returns a new independent instance.
- `close()` releases resources and stops reception for this instance only.

## Examples

### Cross-tab communication

```js
// Tab A
const broadcastChannel = runtime.resolve('broadcastChannel');
const ch = broadcastChannel.create('notifications');

ch.post({ type: 'reload', version: '2.1.0' });
ch.close();
```

```js
// Tab B (same origin)
const ch = broadcastChannel.create('notifications');
const unsub = ch.on((data) => {
    if (data.type === 'reload') location.reload();
});

// Cleanup
window.addEventListener('unload', unsub);
```

### Multiple listeners

```js
const ch = broadcastChannel.create('sync');

const unsub1 = ch.on((data) => updateUI(data));
const unsub2 = ch.on((data) => logEvent(data));

// Remove a specific listener
unsub1();
```

## Worker Usage

`BroadcastChannel` is available in Web Workers, SharedWorkers, and ServiceWorkers.

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const ch = libs.broadcastChannel.create(args.channelName);
        ch.post({ status: 'done', result: computeResult() });
        ch.close();
    },
    { dependencies: ['broadcastChannel'], args: { channelName: 'worker-results' } }
);
```

## Notes

- Messages received in send order per channel, but inter-channel order is not guaranteed.
- Data sent via structured clone — `Function`, `Symbol`, `undefined` are not transferable.
- For message-type routing: wrap with a `{ type, payload }` object and dispatch on the receiver side.
- For RPC (request/response): [`processRPC`](../../process/README.md).
- `isSupported()` returns `false` in environments without `BroadcastChannel` (very old contexts).

## See also

- [processMessage](../../process/README.md) — inter-context message routing by command
- [ws](./ws.md) — client ↔ server communication
- [serviceWorker](../sw/serviceWorker.md) — window ↔ SW communication via postMessage
