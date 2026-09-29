---
module: heap
category: io/structures
dependencies: []
returns: object
worker-safe: true
status: complete
---

# heap

> Binary heap (priority queue) — O(log n) push/pop, O(1) peek, min-heap by default.

**Module** `heap` | **Source** `packages/front/fw/src/io/structures/heap.js` | **Deps** none | **Worker-safe** yes

Binary heap array with siftUp/siftDown. `initial` is heapified via Floyd's algorithm in O(n). Default: numeric min-heap; max-heap or custom comparison via `comparator`. Supports persistence via `snapshot()` and restoration via `create({ snapshot })`, as well as an external backing `Array` or `TypedArray`.

## Resolve

```js
const heapMod = runtime.resolve('heap');
// Returns: { create }
const h = heapMod.create({ comparator: (a, b) => a - b, initial: [3, 1, 4] });
// Instance: { push, pop, peek, has, toArray, drain, clear, snapshot, size, isEmpty }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `({ comparator?, initial?, storage?, maxSize?, snapshot? }) => Heap` | New instance |
| `h.push` | `(value) => void` | O(log n) |
| `h.pop` | `() => value \| undefined` | Removes and returns the root; O(log n) |
| `h.peek` | `() => value \| undefined` | Root without removal; O(1) |
| `h.has` | `(value, equals?) => boolean` | O(n) linear scan |
| `h.toArray` | `() => value[]` | Copy in internal heap order (not sorted) |
| `h.drain` | `() => value[]` | Successive pops → sorted array |
| `h.clear` | `() => void` | Empties the heap |
| `h.snapshot` | `() => { data: any[] }` | Shallow copy of the backing in internal heap order |
| `h.size` | getter `number` | Number of elements |
| `h.isEmpty` | getter `boolean` | True if empty |

### `create` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `comparator` | `(a, b) => number` | `(a,b) => a<b?-1:a>b?1:0` | `< 0`: a has higher priority; throws if not a function |
| `initial` | `any[]` | `[]` | Array heapified in O(n) via Floyd; mutually exclusive with `snapshot` |
| `storage` | `Array \| TypedArray` | — | External backing; `maxSize` required if provided |
| `maxSize` | `number` | — | Upper bound; `push` beyond it throws |
| `snapshot` | `{ data: any[] }` | — | Restores state; mutually exclusive with `initial` |

### Persistence

#### `inst.snapshot()`

Returns `{ data: Array<any> }` — shallow copy of the backing in internal heap-array order. The order is sufficient for restoration without heapify.

> **Warning**: the `comparator` is **not** included in the snapshot. Upon restoration, provide a comparator equivalent to the original — the module cannot validate this.

```js
const snap = h.snapshot(); // { data: [...] }
```

#### `create({ snapshot })`

Restores a heap from a snapshot.

```js
const h2 = heapMod.create({ comparator, snapshot: h1.snapshot() });

const storage = new Float64Array(50);
const h3 = heapMod.create({ comparator, storage, maxSize: 50, snapshot: h1.snapshot() });
```

Throws:
- `'heap: initial and snapshot are mutually exclusive'` if both are provided.
- `'heap: snapshot exceeds maxSize'` if `snapshot.data.length > maxSize`.

#### `create({ storage, maxSize })`

Uses an external `Array` or `TypedArray` as backing.

```js
const buf = new Float64Array(1000);
const h = heapMod.create({ comparator: (a, b) => a - b, storage: buf, maxSize: 1000 });
h.push(3.14);
```

Throws:
- `'heap: maxSize required when storage provided'` if `storage` is provided without `maxSize`.
- `'heap: storage length must be >= maxSize'` if `storage.length < maxSize`.
- `'heap: storage must be Array or TypedArray'` if the type is invalid.
- `'heap: maxSize exceeded'` if `push` exceeds the bound.

#### Transferring snapshot via postMessage

```js
const snap = heap.create({ comparator, initial: [5, 3, 8, 1] }).snapshot();
worker.postMessage({ snap });

// Worker
onmessage = ({ data: { snap } }) => {
    const h = heapMod.create({ comparator: (a, b) => a - b, snapshot: snap });
    postMessage(h.drain());
};
```

## Examples

### Task scheduler by deadline

```js
const heap = runtime.resolve('heap');
const h = heap.create({ comparator: (a, b) => a.deadline - b.deadline });

h.push({ deadline: Date.now() + 5000, fn: task1 });
h.push({ deadline: Date.now() + 1000, fn: task2 });

const next = h.pop(); // task2 (earliest deadline)
next.fn();
```

### Top-K elements

```js
const h = heap.create({ comparator: (a, b) => b - a }); // max-heap
for (const val of stream) {
    h.push(val);
    if (h.size > K) h.pop(); // removes the largest → keeps the K smallest
}
```

### O(n) heapify from array

```js
const h = heap.create({ initial: [9, 4, 7, 2, 8, 1] });
console.log(h.drain()); // [1, 2, 4, 7, 8, 9]
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const h = libs.heap.create();
        for (const v of args[0]) h.push(v);
        return h.drain();
    },
    { dependencies: ['heap'], args: [[5, 3, 8, 1]] }
);
```

## Notes

- `pop()` on an empty heap returns `undefined` without throwing.
- `has(value, equals)` is O(n) — do not use in a hot loop; prefer an auxiliary `Set`.
- `toArray()` returns a copy in internal heap order (not sorted); use `drain()` for sorted order.
- Max-heap: `comparator: (a, b) => b - a`.
- For Dijkstra with decrease-key, an IndexedHeap is needed (out of scope — `lib/`).
- `snapshot()` returns a structured-cloneable object if values are structured-cloneable; the `comparator` (closure) never is — always re-provide it on the receiving side.

## See also

- [btree](./btree.md) — ordered map with range queries
- [lruCache](./lruCache.md) — bounded O(1) cache
