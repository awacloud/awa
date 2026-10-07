---
module: mdHighlight
category: md/extra
dependencies: [mdNode, mdAstWalker, mdAstTypes]
returns: object
worker-safe: true
status: complete
---

# mdHighlight

> `==marked==` → `<mark>`.

**Module** `mdHighlight` | **Source** `packages/front/office/md/src/extra/highlight.js` | **Deps** `mdNode`, `mdAstWalker`, `mdAstTypes` | **Worker-safe** yes

AST post-walk over adjacent runs of text nodes. Replaces `==text==` with `highlight` nodes containing the highlighted text.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md          = runtime.resolve('md');
const mdHighlight = runtime.resolve('mdHighlight');
const m = md.createMd().use(mdHighlight);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdHighlight'`, the key `.use()` deduplicates on |
| `install` | `(md) => void` | Patches `md.parse`, `md.render` and `md.renderHtml` |
| `expandHighlightInAst` | `(root: Node) => void` | Standalone helper: builds `highlight` nodes from `==text==` |
| `lowerHighlightToHtml` | `(root: Node) => void` | Render-time rewrite of each `highlight` node into `<mark>` inline HTML |

## Examples

### Case 1 — basic

```js
const m = md.createMd().use(mdHighlight);
m.renderHtml('Text ==marked text== continues.');
// '<p>Text <mark>marked text</mark> continues.</p>\n'
```

### Case 2 — multiple marks

```js
m.renderHtml('==a== and ==b== both.');
// '<p><mark>a</mark> and <mark>b</mark> both.</p>\n'
```

## Notes

- A single `=` is not processed — it must be `==…==`.
- Content between `==` cannot contain a newline (regex `[^\n]*?`).
- Adjacent text siblings are concatenated before scanning — a `==` spanning multiple text nodes (from the inline parser) is recognized.
- Produced `highlight` nodes are lowered to `<mark>` by the render wrapper installed in `install`.
- Install `mdHighlight` after `mdMath`; installed before it, `$a==b==c$` is split before math claims it.

## See also

- [`mdSubsuper`](./subsuper.md) — another inline extra, `~x~`/`^x^`
- [`mdMath`](./math.md) — another `$…$` extra
- [Extending](../../guide/extending.md)
