---
module: sharedWorker
category: dom/sw
dependencies: [processRPC]
returns: object
worker-safe: false
status: complete
---

# sharedWorker

> Native SharedWorker wrapper — shared cross-tab connection with bidirectional RPC.

**Module** `sharedWorker` | **Source** `packages/front/fw/src/dom/sw/sharedWorker.js` | **Deps** `processRPC` | **Worker-safe** no

Provides a unique shared connection between all tabs of the same origin via the native `SharedWorker` API. Bidirectional RPC is handled by `processRPC`. If the API is unavailable (mobile Safari, some restricted configurations), the recommended fallback is `leaderElection`.

## Resolve

```js
const sharedWorker = runtime.resolve('sharedWorker');
// Returns: { create, support }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `create` | `(opts: { url: string, name?: string, credentials?: string }) => Handle` | Connection handle |
| `support` | `() => { sharedWorker: boolean }` | API availability |

### `sharedWorker.create(opts)`

Creates a connection to a SharedWorker. Automatically calls `port.start()`.

Throws `SharedWorkerNotSupported` (`.name` property) if `typeof SharedWorker === 'undefined'`, allowing calling code to implement the fallback.

**Options:**

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `url` | `string` | — | SharedWorker script URL. |
| `name` | `string` | — | Optional name to distinguish multiple workers. |
| `credentials` | `string` | — | Credentials policy (`'omit'`, `'same-origin'`, `'include'`). |

**Returned handle:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `port()` | `() => MessagePort` | Native port (advanced usage). |
| `rpc(api)` | `(Record<string, Function>) => { call: Promise<Proxy>, expose }` | Bidirectional RPC via `processRPC`. |
| `online()` | `() => boolean` | `true` if the connection is established. |
| `onError(fn)` | `(Function) => void` | Notified on `onerror` + `onmessageerror`. |
| `close()` | `() => void` | Closes the port (the worker remains alive if other tabs are connected). |

### `sharedWorker.support()`

Returns `{ sharedWorker: boolean }` indicating whether the API is available in the current environment.

## Examples

### Basic connection + support check

```js
const sharedWorker = runtime.resolve('sharedWorker');

if (!sharedWorker.support().sharedWorker) {
    // Fallback leaderElection
    const leaderElection = runtime.resolve('leaderElection');
    // ...
}

const sw = sharedWorker.create({ url: '/shared.js', name: 'app' });
sw.onError((err) => console.error('SharedWorker error:', err));
console.log('connected:', sw.online()); // true
```

### Bidirectional RPC

```js
const sharedWorker = runtime.resolve('sharedWorker');
const sw = sharedWorker.create({ url: '/shared.js' });

// Expose a local API + get a proxy to the worker
const { call } = sw.rpc({
    onTabAction: (payload) => handleLocalAction(payload),
});

// call is a Promise<Proxy> — await before use
const remote = await call;
const result = await remote.broadcastToAll({ type: 'sync' });
```

### Clean close

```js
const sw = sharedWorker.create({ url: '/shared.js' });
// The worker remains alive as long as another tab is connected
sw.close();
```

### Fallback pattern with leaderElection

```js
const sharedWorker = runtime.resolve('sharedWorker');
const leaderElection = runtime.resolve('leaderElection');

let coordination;

if (sharedWorker.support().sharedWorker) {
    const sw = sharedWorker.create({ url: '/shared.js' });
    coordination = { broadcast: async (msg) => (await sw.rpc({}).call).broadcast(msg) };
} else {
    // Fallback: only the leader tab handles shared messages
    const leader = leaderElection.create({ channel: 'app-coord' });
    coordination = { broadcast: (msg) => leader.isLeader() && handleBroadcast(msg) };
}
```

## Notes

- `close()` closes only the current tab's `MessagePort`. The SharedWorker remains active as long as at least one tab is connected — this is the native API behavior.
- The `SharedWorkerNotSupported` error (`.name` property) is typed to allow detection `catch(e) { if (e.name === 'SharedWorkerNotSupported') { /* fallback */ } }` without string-based coupling.
- `rpc()` returns `{ call: Promise<Proxy> }`: await `call` before calling remote methods.
- `support()` can be called at any time, including before `create()`.

## See also

- [leaderElection](../utils/leaderElection.md) — recommended fallback when SharedWorker is unavailable
- [processRPC](../../process/rpc.md) — Promise-based RPC on MessageChannel
- [serviceWorker](./serviceWorker.md) — Service Worker lifecycle (window-side)
