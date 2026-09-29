---
module: cache
category: dom/sw
dependencies: []
returns: object
worker-safe: true
status: complete
---

# cache

> Cache API wrapper — request/response pair storage, usable from SW, Worker, and window.

**Module** `cache` | **Source** `packages/front/fw/src/dom/sw/cache.js` | **Deps** none | **Worker-safe** yes

Thin wrapper around the global `caches` (Cache API). Stores and retrieves request/response pairs without native expiration. TTL management and offline strategies are the responsibility of the call site or the SW.

## Resolve

```js
const cache = runtime.resolve('cache');
// Returns: { open, delete, has, keys, match }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `open` | `(name: string) => Promise<CacheWrapper>` | Named cache |
| `delete` | `(name: string) => Promise<boolean>` | `true` if deleted |
| `has` | `(name: string) => Promise<boolean>` | Cache exists |
| `keys` | `() => Promise<string[]>` | Names of all caches |
| `match` | `(request) => Promise<Response \| undefined>` | Search across all caches |

### `CacheWrapper` object

| Method | Signature | Returns |
|---------|-----------|---------|
| `put` | `(request, response) => Promise<void>` | Store an entry |
| `match` | `(request, options?) => Promise<Response \| undefined>` | Retrieve a response |
| `matchAll` | `(request?) => Promise<Response[]>` | All matching responses |
| `add` | `(request) => Promise<void>` | Fetch + store |
| `addAll` | `(requests) => Promise<void>` | Fetch + store multiple |
| `delete` | `(request) => Promise<boolean>` | Delete an entry |
| `keys` | `() => Promise<Request[]>` | All stored keys |

## Examples

### Cache and read

```js
const cache = runtime.resolve('cache');

const c = await cache.open('api-v1');
await c.put('/api/user', new Response(JSON.stringify({ name: 'Alice' })));

const resp = await c.match('/api/user');
const data = await resp.json(); // { name: 'Alice' }
```

### Cache-first strategy (from a SW)

```js
// In sw.js
self.addEventListener('fetch', (event) => {
    event.respondWith(
        cache.open('static-v1').then(async (c) => {
            const cached = await c.match(event.request);
            if (cached) return cached;
            const fresh = await fetch(event.request);
            c.put(event.request, fresh.clone());
            return fresh;
        })
    );
});
```

### Cache versioning

```js
const cache = runtime.resolve('cache');

// Delete old caches
const activeCache = 'app-v2';
const keys = await cache.keys();
await Promise.all(
    keys.filter(k => k !== activeCache).map(k => cache.delete(k))
);
```

## Worker Usage

`caches` is available in Web Workers and Service Workers.

```js
const worker = fw.createWorker(
    async function ({ libs, args, process }) {
        const c = await libs.cache.open(args.cacheName);
        const resp = await c.match(args.url);
        self.postMessage(resp ? await resp.text() : null);
    },
    { dependencies: ['cache'], args: { cacheName: 'api-v1', url: '/data' } }
);
```

## Notes

- The Cache API **has no native expiration** — implement TTL at the application level (e.g. store a timestamp in the key or the response).
- `cache.open` is idempotent — repeated calls with the same name return the same instance (native semantics).
- Throws `'cache: caches API is not available'` if `globalThis.caches` is absent (very old browser or non-secure context).
- For precomposed offline-first/stale-while-revalidate strategies, this layer should be enriched on the `lib/` side.

## See also

- [serviceWorker](./serviceWorker.md) — SW lifecycle (window-side)
- [broadcastChannel](../net/broadcastChannel.md) — SW ↔ clients communication
