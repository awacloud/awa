---
module: remoteStore
category: dom/fs
dependencies: [ajax, ws, eventBus]
returns: object
worker-safe: true
status: complete
---

# remoteStore

> Remote key-value store with pluggable HTTP or WebSocket transport and real-time watch.

**Module** `remoteStore` | **Source** `packages/front/fw/src/dom/fs/remoteStore.js` | **Deps** `ajax`, `ws`, `eventBus` | **Worker-safe** yes

The module exposes a single `create(opts)` method that returns a remote store instance.
Two transports are available: `'http'` (default, independent requests with 1 network retry)
and `'ws'` (persistent JSON-RPC connection, exponential reconnect, real-time watch).

Conflict resolution is out of scope — delegated to `sde_task_sync`.

## Resolve

```js
const remoteStore = runtime.resolve('remoteStore');
// Returns: { create }
```

## API

### `remoteStore.create(opts)`

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `endpoint` | `string` | — | HTTP or WebSocket base URL (required). |
| `auth` | `string` | — | Bearer token (HTTP) or initial auth (WS). |
| `transport` | `'http'\|'ws'` | `'http'` | Transport to use. |
| `headers` | `object` | `{}` | Additional HTTP headers (HTTP only). |

Returns a `RemoteStoreInstance`.

### Instance — methods

| Method | Signature | Returns |
|---------|-----------|---------|
| `get(key)` | `(string) => Promise<value \| null>` | Value or `null` if absent (404). |
| `set(key, value)` | `(string, any) => Promise<void>` | Resolves when write is confirmed. |
| `delete(key)` | `(string) => Promise<void>` | Resolves when deletion is confirmed. |
| `list(params?)` | `({ prefix?, limit?, cursor? }) => Promise<{ keys, cursor? }>` | Cursor-based pagination. |
| `batch(ops)` | `(Array<{op, key, value?}>) => Promise<void>` | Batch of operations (see semantics below). |
| `watch(pattern, fn)` | `(string, Function) => off` | WS only — real-time changes. |
| `connected()` | `() => boolean` | `true` if the connection is active. |
| `close()` | `() => void` | Permanently closes the store. |

### `batch` — HTTP vs WS semantics

| Transport | Behavior |
|-----------|--------------|
| **HTTP** | Single POST `/batch` with `{ ops: [...] }`. Operations are executed server-side without atomicity guarantee. On network error, 1 automatic retry. |
| **WS** | Single RPC message `{ op: 'batch', ops: [...], id }`. Atomicity is guaranteed server-side (all or nothing). |

### `watch(pattern, fn)` — WS only

Supported patterns: `'*'` (all keys), `'prefix:*'` (prefix), `'exact:key'` (exact).
Returns an `off()` function to unsubscribe.

In HTTP mode, `watch` immediately returns a no-op `off` function without triggering an error.

## Examples

### Basic HTTP usage

```js
const remoteStore = runtime.resolve('remoteStore');
const store = remoteStore.create({
    endpoint: 'https://api.example.com/store',
    auth: 'my-bearer-token'
});

await store.set('user:1', { name: 'Alice', role: 'admin' });
const user = await store.get('user:1');
// { name: 'Alice', role: 'admin' }

const listing = await store.list({ prefix: 'user:', limit: 50 });
// { keys: ['user:1', ...], cursor: '...' }

await store.delete('user:1');
store.close();
```

### WebSocket usage with watch

```js
const remoteStore = runtime.resolve('remoteStore');
const store = remoteStore.create({
    endpoint: 'wss://api.example.com/store',
    transport: 'ws',
    auth: 'my-bearer-token'
});

// Watch session changes in real time
const off = store.watch('sess:*', ({ key, value }) => {
    console.log('Session changed:', key, value);
});

await store.set('sess:abc', { userId: 42 });
// → handler called: { op: 'change', key: 'sess:abc', value: { userId: 42 } }

off(); // unsubscribe
store.close();
```

### Atomic WS batch

```js
const store = remoteStore.create({ endpoint: 'wss://api.example.com/store', transport: 'ws' });
await store.batch([
    { op: 'set',    key: 'counter', value: 0 },
    { op: 'set',    key: 'status',  value: 'active' },
    { op: 'delete', key: 'stale' }
]);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args, process }) {
        const store = libs.remoteStore.create({
            endpoint: args[0],
            transport: 'ws',
            auth: args[1]
        });
        store.get('config').then(v => {
            store.close();
            self.postMessage(v);
        });
    },
    { dependencies: ['remoteStore'], args: ['wss://api.example.com/store', 'token'] }
);
```

## Notes

- In HTTP mode, `connected()` always returns `true` — there is no persistent connection.
- In WS mode, pending RPCs are automatically rejected if the connection closes; they are not re-emitted after reconnection (the caller must retry).
- WS reconnection uses exponential backoff capped at 30 s; each attempt emits `'remoteStore:reconnect'` on `eventBus` with `{ endpoint, attempt }`.
- `batch` semantics differ by transport: best-effort sequential in HTTP, atomic in WS.
- `watch` is only functional in `'ws'` mode; in `'http'` mode it returns a no-op `off` function.
- The `encoding: 'cbor'` option is reserved for a future integration of the `cbor` module; MVP = JSON only.

## See also

- [ajax](../net/ajax.md) — underlying HTTP transport
- [ws](../net/ws.md) — underlying WebSocket transport
- [eventBus](../../io/utils/eventBus.md) — `remoteStore:reconnect` events
- [indexedDB](./indexedDB.md) — local key-value persistence
- [storage](./storage.md) — localStorage / sessionStorage
