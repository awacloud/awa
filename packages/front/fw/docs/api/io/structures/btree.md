---
module: btree
category: io/structures
dependencies: []
returns: object
worker-safe: true
status: complete
---

# btree

> B-tree m-way ordered map — O(log n) insert/get/delete, range queries, ordered iteration.

**Module** `btree` | **Source** `packages/front/fw/src/io/structures/btree.js` | **Deps** none | **Worker-safe** yes

Minimum degree `t = ceil(order/2)`, max keys per node `2t-1` (CLRS). Pre-split on the way down for insertions, borrow/merge on the way up for deletions. Balance invariant guaranteed.

## Resolve

```js
const btree = runtime.resolve('btree');
const b = btree.create({ order: 5 });
// Returns: { insert, get, has, delete, range, keys, values, entries, min, max, clear, snapshot, size }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `({ order?, comparator?, snapshot? }) => BTree` | New instance |
| `b.insert` | `(key, value) => void` | O(log n); updates if key exists |
| `b.get` | `(key) => value \| undefined` | O(log n) |
| `b.has` | `(key) => boolean` | O(log n) |
| `b.delete` | `(key) => boolean` | O(log n) |
| `b.range` | `(low, high, options?) => Iterator<[key,value]>` | Keys in the interval |
| `b.keys` | `() => Iterator<key>` | Ascending order (in-order) |
| `b.values` | `() => Iterator<value>` | Ascending order |
| `b.entries` | `() => Iterator<[key,value]>` | Ascending order |
| `b.min` | `() => {key,value} \| null` | Smallest key |
| `b.max` | `() => {key,value} \| null` | Largest key |
| `b.clear` | `() => void` | Empties the tree |
| `b.snapshot` | `() => { order, entries: Array<[key,value]> }` | Sorted ascending snapshot |
| `b.size` | getter `number` | Number of keys |

### `create` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `order` | `integer >= 3` | `5` | Max children per node; throws if invalid |
| `comparator` | `(a, b) => number` | natural `<`/`>` order | Must be total and stable; throws if not a function |
| `snapshot` | `{ order, entries: Array<[key,value]> }` | — | Snapshot returned by `b.snapshot()`; restores the tree |

### `range` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeLow` | `boolean` | `true` | Include `low` in results |
| `includeHigh` | `boolean` | `false` | Include `high` in results |

### Persistence

`btree` does not accept a `{ storage }` option (multi-node structure, not a flat backing array). Persistence goes through snapshot/restore only.

#### `b.snapshot()`

Extracts the current state as a structured-cloneable object:

```js
{ order: number, entries: Array<[key, value]> }
```

Entries are in ascending order (in-order). Cost O(n).

#### `create({ snapshot })`

Restores a tree from a snapshot. Throws `'btree: snapshot.order mismatch'` if `snapshot.order !== order`. Restoration re-inserts every entry — cost O(n log n).

**Warning**: the `comparator` is not serialized in the snapshot. The caller must supply an equivalent comparator to `create(...)` upon restoration.

```js
const btree = runtime.resolve('btree');

const b1 = btree.create({ order: 5, comparator: myComparator });
for (const [k, v] of sourceData) b1.insert(k, v);
const snap = b1.snapshot();

const b2 = btree.create({ order: 5, comparator: myComparator, snapshot: snap });
console.log(b2.size === b1.size); // true
```

## Examples

### Ordered index — range query

```js
const btree = runtime.resolve('btree');
const prices = btree.create();

products.forEach(p => prices.insert(p.price, p));

// Items between 100 and 500 (100 inclusive, 500 exclusive)
for (const [price, product] of prices.range(100, 500)) {
    console.log(product.name, price);
}
```

### Custom comparator (objects)

```js
const b = btree.create({
    comparator: (a, b) => a.timestamp - b.timestamp
});
b.insert({ timestamp: 1000, id: 'a' }, eventA);
b.insert({ timestamp: 500,  id: 'b' }, eventB);

console.log(b.min().key.id); // 'b' (timestamp 500)
```

### Insert/delete with size tracking

```js
const b = btree.create({ order: 3 });
for (let i = 0; i < 1000; i++) b.insert(i, i * 2);
console.log(b.size); // 1000

for (let i = 0; i < 500; i++) b.delete(i);
console.log(b.size); // 500
console.log([...b.keys()].slice(0, 3)); // [500, 501, 502]
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const b = libs.btree.create();
        for (const [k, v] of args[0]) b.insert(k, v);
        return [...b.range(args[1], args[2])];
    },
    { dependencies: ['btree'], args: [entries, low, high] }
);
```

## Notes

- `order = 5` is the default (typical fanout for in-memory use); for large volumes, increase it (e.g. `order: 101`).
- `insert` on an existing key is an update: `size` does not change.
- `range(low, high)`: default inclusive/exclusive `[low, high)` — consistent with JS interval conventions.
- Iterations (`keys`, `values`, `entries`, `range`) are generators: avoid mutations during iteration.
- No `{ storage }` — for a paged B-tree, see `lib/`.

## See also

- [trie](./trie.md) — prefix search on string keys
- [heap](./heap.md) — priority queue without range queries
