---
module: mdAstManipulation
category: md/ast
dependencies: [mdErrors, mdNode]
returns: object
worker-safe: true
status: complete
---

# ast/manipulation

> Mutation/query helpers — `replaceNode`, `wrapNode`, `flattenNode`, `findFirst/All`, `cloneNode`.

**Module** `mdAstManipulation` | **Source** `packages/front/office/md/src/ast/manipulation.js` | **Deps** `mdErrors`, `mdNode` | **Worker-safe** yes

High-level API for transforming a parsed AST. Operates on the linked-list shape (`firstChild` / `lastChild` / `prev` / `next` / `parent`). `replaceNode`, `wrapNode` and `flattenNode` mutate the tree in place (a replaced or flattened node is unlinked, not destroyed, so the argument stays a valid object); `findFirst` / `findAll` only read; `cloneNode` copies. The module also returns the `ContractError` class it throws.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const { replaceNode, wrapNode, flattenNode, findFirst, findAll, cloneNode } = runtime.resolve('mdAstManipulation');
```

Direct factory call (manually chaining its 2 deps):

```js
import { mdAstManipulation, mdErrors, mdNode } from '@awacloud/md';
const m = mdAstManipulation.factory(mdErrors.factory(), mdNode.factory());
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `replaceNode` | `(old: Node, fresh: Node) => Node` | `fresh` |
| `wrapNode` | `(node: Node, wrapper: Node) => Node` | `wrapper` |
| `flattenNode` | `(node: Node) => void` | — (lifts children) |
| `findFirst` | `(root, pred) => Node \| null` | First match |
| `findAll` | `(root, pred) => Node[]` | All matches |
| `cloneNode` | `(node, deep=false) => Node` | Scalar copy + (deep) children |

## Examples

### Case 1 — replace a link

```js
const { findAll, replaceNode } = runtime.resolve('mdAstManipulation');
const { Node } = runtime.resolve('mdNode');
const md = runtime.resolve('md');

const ast = md.parse('see [old](http://x).');
const link = findAll(ast, n => n.type === 'link')[0];
const txt = new Node('text'); txt.literal = '[redacted]';
replaceNode(link, txt);
```

### Case 2 — wrap a node

```js
const { wrapNode } = runtime.resolve('mdAstManipulation');
const { Node } = runtime.resolve('mdNode');
const md = runtime.resolve('md');
const para = md.parse('hello').firstChild;
const wrap = new Node('block_quote');
wrapNode(para, wrap);
// the paragraph is now a child of the block_quote
```

### Case 3 — flatten (unwrap)

```js
const { flattenNode } = runtime.resolve('mdAstManipulation');
const md = runtime.resolve('md');
const emphNode = md.parse('a *b* c').firstChild.firstChild.next;   // the `emph` node
flattenNode(emphNode); // emphNode's children take its place
```

## Notes

- `replaceNode` / `wrapNode` / `flattenNode` throw `ContractError` (codes `md/replace-node-no-parent`, `md/wrap-node-no-parent`, `md/flatten-node-no-parent`) if the node argument has no parent.
- `cloneNode` defaults to **shallow**: copies the scalar slots (`type`, `level`, `literal`, …) + `data` (shallow `Object.assign`). With `deep=true`, recursively copies children.
- `findFirst` / `findAll` traverse depth-first via `Walker`; for a predicate that doesn't depend on the parent, this is optimal.
- The operations preserve `prev` / `next` / `parent` linked-list consistency — no leaks.

## See also

- [`ast/node`](./node.md) — underlying primitives + `Walker` / `walk()`
- [Read+write](../../guide/read-write.md) — extract + transform + re-emit pattern
