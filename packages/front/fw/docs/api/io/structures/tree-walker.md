---
module: treeWalker
category: io/structures
dependencies: []
returns: object
worker-safe: true
status: complete
---

# treeWalker

> Generic visiting iterator for linked-tree nodes (entering / leaving events).

**Module** `treeWalker` | **Source** `packages/front/fw/src/io/structures/tree-walker.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const tree = runtime.resolve('treeWalker');
// Returns: { createWalker, walk, findFirst, findAll, replaceNode, wrapNode, flattenNode, cloneNode }
```

## Node contract

For an object to be *walkable*, it must expose at minimum:

| Field | Type | Required | Usage |
|-------|------|----------|-------|
| `parent` | `object\|null` | yes | ascent after children |
| `firstChild` | `object\|null` | yes | descent into the tree |
| `next` | `object\|null` | yes | advance to the next sibling |
| `lastChild` | `object\|null` | recommended | required by manipulation helpers |
| `prev` | `object\|null` | recommended | required by `insertBefore`, `unlink` |
| `unlink()` | `function` | helpers | detaches the node from its parent |
| `appendChild(child)` | `function` | helpers | appends a child at the end of the list |
| `insertBefore(sibling)` | `function` | helpers | inserts before this node |
| `insertAfter(sibling)` | `function` | helpers | inserts after this node |

> **Minimum for traversal only**: `parent`, `firstChild`, `next`.
>
> **Full contract (manipulation helpers)**: all fields above.

The canonical CommonMark form (`{ parent, firstChild, lastChild, prev, next }`) satisfies the full contract. DOM `Element` nodes also do.

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `createWalker` | `(root: object) => Walker` | Iterator `{ next(), resumeAt() }` |
| `walk` | `(root: object) => Generator` | ES6 generator for `for…of` |
| `findFirst` | `(root: object, predicate: fn) => object\|null` | First DFS node where `predicate` is true |
| `findAll` | `(root: object, predicate: fn) => object[]` | All matching nodes, DFS pre-order |
| `replaceNode` | `(oldNode: object, newNode: object) => object` | `newNode` (oldNode unlinked) |
| `wrapNode` | `(node: object, wrapperFactory: fn) => object` | Wrapper node returned by the factory |
| `flattenNode` | `(node: object) => void` | Hoists children one level up |
| `cloneNode` | `(node: object, deep?: boolean) => object` | Copy of the node (default `deep = true`) |

### Walker — interface returned by `createWalker`

```ts
interface Walker {
    next(): { node: object, entering: boolean } | null;
    resumeAt(node: object, entering: boolean): void;
}
```

- `entering = true`: first visit of a node (container or leaf).
- `entering = false`: closing a container after visiting all its descendants.
- **Leaves** (`firstChild === null`) only emit `entering: true`.

## Examples

```js
const tree = runtime.resolve('treeWalker');

// --- Classic walker ---
const walker = tree.createWalker(rootNode);
let event;
while ((event = walker.next()) !== null) {
    const { node, entering } = event;
    if (entering && node.type === 'heading') console.log('h' + node.level);
}

// --- Iterable for…of ---
for (const { node, entering } of tree.walk(rootNode)) {
    if (!entering) console.log('close', node.type);
}

// --- Search ---
const firstHeading = tree.findFirst(root, n => n.type === 'heading');
const allLinks     = tree.findAll(root, n => n.type === 'link');

// --- Manipulation ---
const newNode = makeNode('paragraph');
tree.replaceNode(oldNode, newNode);           // swap

tree.wrapNode(node, original => {            // wrap
    const w = makeNode('div');
    return w;
});

tree.flattenNode(containerNode);             // lift children

const deepCopy    = tree.cloneNode(node);       // deep (default)
const shallowCopy = tree.cloneNode(node, false); // no children
```

## Worker Usage

This module is fully worker-safe: no DOM access, no side effects at instantiation.

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const tree = libs.treeWalker;
        const events = [...tree.walk(args.root)];
        self.postMessage(events.length);
    },
    { dependencies: ['treeWalker'], args: { root: astRoot } }
);
```

## Notes

- The Walker pattern is compatible with CommonMark ASTs (package `@awacloud/md`), XML trees, JSON-LD graphs, and any tree whose nodes satisfy the contract above.
- `cloneNode` copies all own enumerable properties of the node; link fields (`parent`, `prev`, `next`, `firstChild`, `lastChild`) are reset to `null` on the root copy.
- `replaceNode`, `wrapNode`, and `flattenNode` throw a `ContractError` (with `err.name === 'ContractError'`) if the target node has no parent.

## See also

- [lruCache](./lruCache.md) — O(1) LRU cache
- [btree](./btree.md) — ordered B-tree (ordered map, range queries)
