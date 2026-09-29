---
module: trie
category: io/structures
dependencies: []
returns: object
worker-safe: true
status: complete
---

# trie

> Unicode-safe prefix tree — autocomplete and prefix search on string keys.

**Module** `trie` | **Source** `packages/front/fw/src/io/structures/trie.js` | **Deps** none | **Worker-safe** yes

Map-backed nodes, iteration via Unicode code points (`for...of`). Deletion cleans up orphan nodes (no phantom memory).

## Resolve

```js
const trie = runtime.resolve('trie');
// Returns: { create }
const t = trie.create();
// Instance: { insert, has, get, hasPrefix, search, delete, keys, clear, snapshot, size }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `({ snapshot? }?) => Trie` | New instance, optionally restored |
| `t.insert` | `(key: string, value?: any) => void` | Inserts or updates (default `true`) |
| `t.has` | `(key: string) => boolean` | Exact match |
| `t.get` | `(key: string) => any \| undefined` | Value or `undefined` |
| `t.hasPrefix` | `(prefix: string) => boolean` | At least one key starts with prefix |
| `t.search` | `(prefix: string, limit?: number) => {key,value}[]` | All keys starting with prefix (max `limit`) |
| `t.delete` | `(key: string) => boolean` | Removes; cleans up orphan nodes |
| `t.keys` | `() => Iterator<string>` | Lexicographic DFS |
| `t.clear` | `() => void` | Empties the trie |
| `t.snapshot` | `() => { entries: [string, any][] }` | Extracts all entries (DFS) |
| `t.size` | getter `number` | Number of keys |

## Examples

### Input autocomplete

```js
const trie = runtime.resolve('trie');
const dict = trie.create();

['apple', 'application', 'apply', 'banana', 'band'].forEach(w => dict.insert(w));

function autocomplete(prefix, max = 10) {
    return dict.search(prefix, max).map(r => r.key);
}

autocomplete('app'); // ['apple', 'application', 'apply']
autocomplete('ban'); // ['banana', 'band']
```

### Dictionary with values

```js
const t = trie.create();
t.insert('fr', { lang: 'French', region: 'FR' });
t.insert('fr-CA', { lang: 'French', region: 'CA' });

t.get('fr');    // { lang: 'French', region: 'FR' }
t.get('fr-CA'); // { lang: 'French', region: 'CA' }
t.hasPrefix('fr'); // true
```

### Unicode keys

```js
const t = trie.create();
t.insert('café', 1);
t.insert('日本語', 2);

t.has('café');  // true
t.hasPrefix('日'); // true
t.search('caf'); // [{ key: 'café', value: 1 }]
```

### Persistence

#### `inst.snapshot()`

Extracts all entries from the trie as a structured-cloneable object:

```js
const snap = t.snapshot();
// { entries: [['apple', 1], ['application', 2], ...] }
```

- Entry order follows the DFS order of the trie (Map insertion order), **not** sorted lexicographically. The caller may sort `entries` if needed.
- Read cost: O(n × avg_k) — n = number of keys, avg_k = average length.
- Cloneable via `structuredClone` / `postMessage` if values are.

#### `create({ snapshot })`

Restores a trie from a snapshot:

```js
const t2 = trie.create({ snapshot: t1.snapshot() });
// t2 contains all keys/values from t1
```

- After initializing an empty root, iterates `snapshot.entries` and calls `insert(key, value)` for each tuple.
- Restoration cost: O(n × avg_k).
- No `{ storage }`: the trie uses nested `Map`s, not serializable to a flat array without a node-pool refactor (out of scope).
- Unicode-safe: emoji / BMP+ keys are preserved.

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const t = libs.trie.create();
        for (const word of args[0]) t.insert(word);
        return t.search(args[1], 5).map(r => r.key);
    },
    { dependencies: ['trie'], args: [wordList, prefix] }
);
```

## Notes

- Iteration via code points (`for...of`): emoji and non-BMP characters handled correctly.
- `search('')` (empty prefix) returns all keys.
- `delete` cleans up nodes with no children and no value — no unbounded growth after deletions.
- For a compressed trie (Patricia/radix), see `lib/` — out of scope for this module.
- `insert(k)` without a value stores `true` — useful for a presence-only trie.

## See also

- [btree](./btree.md) — ordered map for non-string keys or range queries
- [lruCache](./lruCache.md) — bounded cache (exact lookup, not prefix)
