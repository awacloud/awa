---
module: mdWalker
category: md
dependencies: [mdNode]
returns: object
worker-safe: true
status: complete
---

# mdWalker

> Visitor walker enter/exit with `.use(...)` for extensions.

**Module** `mdWalker` | **Source** `packages/front/office/md/src/md-walker.js` | **Deps** `mdNode` | **Worker-safe** yes

Visitor-style walker mirroring ooxml's `docxWalker`. Dispatches `enter` / `exit` per node type, supports a `'*'` wildcard, and exposes `ctx.stop()` / `ctx.skipChildren()` for traversal control. An instance can accumulate extensions via `use(...)` and merges them automatically.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const mdWalker = runtime.resolve('mdWalker');
// { createWalker, walk }
const w = mdWalker.createWalker();
```

The factory itself doesn't consume its declared `mdNode` dependency (`WalkerLocal` is self-contained), so `mdWalker.factory()` also works without DI, if imported directly via `import { mdWalker } from '@awacloud/md'` (the raw descriptor).

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `walk` | `(root, visitors) => void` | One-shot walk, top-level helper |
| `createWalker()` | `() => Walker` | Instance with `.use()` + `.walk()` |

### `Walker` instance

| Method | Signature | Returns |
|--------|-----------|---------|
| `use` | `(...exts: {visitors}[]) => void` | Registers visitors |
| `walk` | `(root, extraVisitors?) => void` | Runs, merging ext visitors + extra |
| `extensions` | `getter ⇒ Array` | Copy of the extensions |
| `hasExtensions` | `getter ⇒ boolean` | — |

### `visitors` shape

```js
const visitors = {
    heading: { enter(node, ctx) { /* … */ }, exit(node, ctx) { /* … */ } },   // any node type: 'link', 'code_block', …
    '*':     { enter(node, ctx) { /* … */ } }                                  // optional wildcard
};
```

### `ctx` shape

| Field | Description |
|-------|-------------|
| `depth` | Nesting depth (root = 0) |
| `parent` | Parent node (null at root) |
| `stop()` | Aborts the whole traversal |
| `skipChildren()` | Skips descending into the current node |

## Examples

### Case 1 — one-shot walk

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const md       = runtime.resolve('md');
const mdWalker = runtime.resolve('mdWalker');

const ast = md.parse('# h1\n\n## h2');
mdWalker.walk(ast, {
    heading: {
        enter(n) { console.log('H' + n.level); }
    }
});
// H1
// H2
```

### Case 2 — instance with extensions

```js
const w = mdWalker.createWalker();
w.use({ visitors: { link: { enter(n) { console.log(n.destination); } } } });
w.walk(ast);
```

## Notes

- For leaves (text, code, softbreak, …), only `enter` is emitted.
- `ctx.skipChildren()` only works on containers (`isContainer === true`).
- `walk()` (top-level) has no extensions registry — use `createWalker()` for that.
- Extension order is preserved: the first registered runs first on `enter`, last on `exit` (LIFO).

## See also

- [`ast/node`](./ast/node.md) — underlying `Walker` class + `walk()` for-of iterable form
- [Extending](../guide/extending.md)
