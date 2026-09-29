# IO / Structures

Low-level data structures. All worker-safe, no DOM dependencies.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [lruCache](./lruCache.md) | `{create}` | none | Bounded LRU cache O(1) |
| [heap](./heap.md) | `{create}` | none | Binary heap (priority queue) O(log n) |
| [ringBuffer](./ringBuffer.md) | `{create}` | none | FIFO ring buffer O(1), circular overwrite |
| [trie](./trie.md) | `{create}` | none | Prefix tree (autocompletion, prefix search) |
| [btree](./btree.md) | `{create}` | none | m-way B-tree (ordered map, range queries) |
| [treeWalker](./tree-walker.md) | `{createWalker, walk, findFirst, findAll, replaceNode, wrapNode, flattenNode, cloneNode}` | none | Generic visitor for linked trees (entering/leaving events) |

## Common pattern

```js
const lruCache = runtime.resolve('lruCache');
const cache = lruCache.create({ maxSize: 128 });

const heap = runtime.resolve('heap');
const h = heap.create({ comparator: (a, b) => a - b });

const ringBuffer = runtime.resolve('ringBuffer');
const rb = ringBuffer.create({ capacity: 256 });

const trie = runtime.resolve('trie');
const t = trie.create();

const btree = runtime.resolve('btree');
const b = btree.create({ order: 5 });
```
