---
module: lruCache
category: io/structures
dependencies: []
returns: object
worker-safe: true
status: complete
---

# lruCache

> Bounded LRU cache — O(1) get/set/delete via Map + doubly-linked list.

**Module** `lruCache` | **Source** `packages/front/fw/src/io/structures/lruCache.js` | **Deps** none | **Worker-safe** yes

JS Map + doubly linked list with sentinel nodes: `head ↔ [MRU] ↔ … ↔ [LRU] ↔ tail`. All operations are O(1).

## Resolve

```js
const lruCache = runtime.resolve('lruCache');
// Returns: { create }
const cache = lruCache.create({ maxSize: 100, onEvict: (key, value) => {} });
// Instance: { get, set, has, peek, delete, clear, keys, values, entries, snapshot, size, maxSize }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `({ maxSize, onEvict?, snapshot? }) => Cache` | New instance |
| `cache.get` | `(key) => value \| undefined` | Value; bumps to MRU |
| `cache.set` | `(key, value) => void` | Inserts or updates; evicts LRU if full |
| `cache.has` | `(key) => boolean` | Presence check without bump |
| `cache.peek` | `(key) => value \| undefined` | Value without bump |
| `cache.delete` | `(key) => boolean` | Removes; calls `onEvict` |
| `cache.clear` | `() => void` | Empties the cache; calls `onEvict` for each entry |
| `cache.keys` | `() => Iterator<key>` | MRU → LRU |
| `cache.values` | `() => Iterator<value>` | MRU → LRU |
| `cache.entries` | `() => Iterator<[key,value]>` | MRU → LRU |
| `cache.snapshot` | `() => { maxSize, entries: Array<[key,value]> }` | Current state MRU→LRU |
| `cache.size` | getter `number` | Current number of entries |
| `cache.maxSize` | getter `number` | Limit (immutable) |

### `create` options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `maxSize` | `integer >= 1` | Yes | Maximum capacity; throws if invalid |
| `onEvict` | `(key, value) => void` | No | Called on LRU eviction, `delete`, `clear` — **not** on `set` replacement or during restore |
| `snapshot` | `{ maxSize, entries }` | No | Snapshot produced by `inst.snapshot()`; restores state |

## Examples

### Basic HTTP cache

```js
const lruCache = runtime.resolve('lruCache');
const cache = lruCache.create({ maxSize: 50 });

async function fetchWithCache(url) {
    if (cache.has(url)) return cache.get(url);
    const data = await fetch(url).then(r => r.json());
    cache.set(url, data);
    return data;
}
```

### With eviction callback

```js
const cache = lruCache.create({
    maxSize: 3,
    onEvict: (key, value) => console.log(`Evicted: ${key}`)
});
cache.set('a', 1);
cache.set('b', 2);
cache.set('c', 3);
cache.set('d', 4); // logs "Evicted: a"
```

### Peek without changing order

```js
const cache = lruCache.create({ maxSize: 3 });
cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
cache.peek('a'); // does not bump 'a'
cache.set('d', 4); // evicts 'a' (still LRU)
```

### Persistence

`lruCache` provides persistence via snapshot/restore — there is **no** `{ storage }` option (the Map + linked list does not expose a flat backing).

#### `inst.snapshot()`

```js
const snap = cache.snapshot();
// { maxSize: 100, entries: [['mruKey', mruVal], ..., ['lruKey', lruVal]] }
```

`[key, value]` tuples are structured-cloneable if keys and values are. `onEvict` is not serialized.

#### `create({ snapshot })`

Constraints:
- `snapshot.maxSize === maxSize`, otherwise throws `'lruCache: snapshot.maxSize mismatch'`.
- `snapshot.entries.length <= maxSize`, otherwise throws `'lruCache: snapshot exceeds maxSize'`.
- `onEvict` is **not** called during restoration.

#### Persisting via `postMessage`

```js
const snap = cache.snapshot();
worker.postMessage({ type: 'restore-cache', snap });

const restored = lruCache.create({
    maxSize: snap.maxSize,
    snapshot: snap,
    onEvict: (k) => console.log('evicted', k),
});
```

#### Persisting via IndexedDB

```js
const snap = cache.snapshot();
await db.put('cache-store', snap, 'lruSnapshot');

const saved = await db.get('cache-store', 'lruSnapshot');
const cache2 = lruCache.create({ maxSize: saved.maxSize, snapshot: saved });
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const cache = libs.lruCache.create({ maxSize: args[0] });
        // computations with a worker-local cache
    },
    { dependencies: ['lruCache'], args: [128] }
);
```

## Notes

- `onEvict` is **not** called when `set` replaces an existing key (update semantics).
- No TTL or time-based expiration — see `lib/` for HTTP caches with Cache-Control.
- Iterators (`keys`, `values`, `entries`) snapshot the current state via the linked list: MRU first.
- `maxSize: 1` is valid — useful as a "most recently used" sentinel.

## See also

- [ringBuffer](./ringBuffer.md) — bounded FIFO (no LRU)
- [heap](./heap.md) — priority queue
