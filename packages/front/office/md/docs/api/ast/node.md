---
module: mdNode
category: md/ast
dependencies: []
returns: object
worker-safe: true
status: complete
---

# ast/node

> `Node` + `Walker` classes — CommonMark-compatible doubly-linked AST tree.

**Module** `mdNode` | **Source** `packages/front/office/md/src/ast/node.js` | **Deps** none | **Worker-safe** yes

`Node` mirrors the `commonmark.js` shape (`firstChild`, `lastChild`, `prev`, `next`, `parent`), with **unprefixed public slots** for direct serialization (structuredClone, JSON). `Walker` produces a depth-first `{ node, entering }` event stream.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const { Node, Walker } = runtime.resolve('mdNode');
```

`mdNode` has zero dependencies, so calling the factory directly also works without a runtime:

```js
import { mdNode } from '@awacloud/md';
const { Node, Walker } = mdNode.factory();
```

## API

The module returns `{ Node, Walker, makeNode, trustedHtmlInline, trustedHtmlBlock }`; `makeNode(type, sourcepos?)` is a shorthand for `new Node(type, sourcepos)`.

### Class `Node`

| Method | Signature | Returns |
|--------|-----------|---------|
| `constructor` | `(type: string, sourcepos?) => Node` | — |
| `isContainer` | `getter ⇒ boolean` | — |
| `appendChild` | `(child: Node) => void` | Appends at the tail |
| `prependChild` | `(child: Node) => void` | Prepends at the head |
| `insertAfter` | `(sibling: Node) => void` | Inserts after this |
| `insertBefore` | `(sibling: Node) => void` | Inserts before this |
| `unlink` | `() => void` | Detaches from its parent + siblings |
| `walker` | `() => Walker` | Walker starting at this |

### Class `Walker`

| Method | Signature | Returns |
|--------|-----------|---------|
| `constructor` | `(root: Node)` | — |
| `next` | `() => {entering, node} \| null` | Next event |
| `resumeAt` | `(node, entering: boolean) => void` | Resets the cursor |

### Trusted HTML factories

| Function | Signature | Returns |
|----------|-----------|---------|
| `trustedHtmlInline` | `(literal: string) => Node` | An `html_inline` node with `literal` set (coerced with `String()`) and the trust marker |
| `trustedHtmlBlock` | `(literal: string) => Node` | An `html_block` node (`htmlBlockType` 6) with `literal` set (coerced with `String()`) and the trust marker |

```js
const { trustedHtmlInline } = runtime.resolve('mdNode');
const mark = trustedHtmlInline('<mark>');
mark.type;              // 'html_inline'
mark.literal;           // '<mark>'
mark._mdTrustedHtml;    // true
```

### `mdAstWalker` — for-of wrapper

A separate module, `mdAstWalker` (`src/ast/walker.js`, dependency `['mdNode']`), adapts `Walker` for `for…of` consumption via a `walk(root)` generator yielding `{ node, entering }`:

```js
const { walk } = runtime.resolve('mdAstWalker');
const ast = runtime.resolve('md').parse('# Hi');
for (const { node, entering } of walk(ast)) {
    if (entering) console.log(node.type);
}
```

`mdAstWalker`'s factory takes the `mdNode` API as an injected dependency to source the `Walker` class identity, and also re-exports `Walker` itself for back-compat.

### `Node` slots

Depending on type:

| Type | Slots |
|------|-------|
| `heading` | `level` (1..6) |
| `code_block` | `literal`, `info`, `isFenced`, `fenceChar`, `fenceLength`, `fenceOffset` |
| `html_block` | `literal`, `htmlBlockType` (1..7) |
| `list` | `listType`, `listStart`, `listTight`, `listDelimiter`, `listBulletChar`, `listPadding`, `listMarkerOffset` |
| `item` | (inherited from `list`) + `checked` (GFM task) |
| `link` / `image` | `destination`, `title` |
| `text` / `code` / `html_inline` | `literal` |
| `table` | `align: ('left'\|'right'\|'center'\|null)[]` |
| `table_cell` | `cellAlign`, `isHeader` |
| `strikethrough` | `delimiterCount` (1 or 2, set by the parser: `~x~` or `~~x~~`) |

Every node has: `type`, `parent`, `firstChild`, `lastChild`, `prev`, `next`, `sourcepos`, `data`.

## Examples

### Manual construction

```js
const { Node } = runtime.resolve('mdNode');
const doc = new Node('document');
const h = new Node('heading'); h.level = 1;
const t = new Node('text'); t.literal = 'Hi';
h.appendChild(t);
doc.appendChild(h);
```

### Walk with the raw `Walker`

```js
const { Walker } = runtime.resolve('mdNode');
const w = new Walker(doc);
let ev;
while ((ev = w.next()) !== null) {
    if (ev.entering) console.log(ev.node.type);
}
```

## Notes

- Containers emit `entering=true` then `entering=false`; leaves only `enter=true`.
- `Walker.resumeAt(node, false)` skips descending into a container — used by [`md-walker`](../md-walker.md) to implement `skipChildren()`.
- `unlink()` is safe to call on an already-detached node.
- A node built by these factories carries the internal trust marker the HTML renderer honours under `safe`; it is the only supported way for a third-party extension to emit HTML that the default render keeps. The marker is an ordinary own enumerable property, so `structuredClone` and `toEqual` treat it like any other slot; the parser never sets it. The factories apply no escaping — escape any untrusted text before passing it in.
- No type validation at the constructor — the caller is responsible for using a valid `T_*` value.

## See also

- [`ast/types`](./types.md) — type constants
- [`ast/manipulation`](./manipulation.md) — `replaceNode`, `wrapNode`, etc.
- [`md-walker`](../md-walker.md) — visitor enter/exit
