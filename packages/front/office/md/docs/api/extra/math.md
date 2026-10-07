---
module: mdMath
category: md/extra
dependencies: [mdNode, mdAstWalker, mdAstTypes, mdShared]
returns: object
worker-safe: true
status: complete
---

# mdMath

> LaTeX math — `$inline$`, `$$display$$`, ` ```math ` fenced.

**Module** `mdMath` | **Source** `packages/front/office/md/src/extra/math.js` | **Deps** `mdNode`, `mdAstWalker`, `mdAstTypes`, `mdShared` | **Worker-safe** yes

Post-parse AST pass: splits text nodes on `$$…$$` / `$…$` boundaries and emits `math_inline` / `math_block` carrying the LaTeX source in `literal`. Fenced code blocks with the `math` info string are also converted to `math_block`. At render time, wraps in `<span class="math inline">` / `<div class="math display">`.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md    = runtime.resolve('md');
const mdMath = runtime.resolve('mdMath');
const m = md.createMd().use(mdMath);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdMath'`, the key `.use()` deduplicates on |
| `install` | `(md) => void` | Patches `md.parse`, `md.render` and `md.renderHtml` |
| `splitMath` | `(lit: string) => Array<{kind, value}> \| null` | Standalone splitter; `null` when the text holds no `$` |
| `expandMathInAst` | `(root: Node) => Node` | Standalone AST pass; returns `root` |
| `lowerMathToHtml` | `(root: Node) => Node` | Render-time rewrite of the math nodes into `<span class="math inline">` / `<div class="math display">` HTML |

## Examples

### Case 1 — inline + display

```js
const m = md.createMd().use(mdMath);
m.renderHtml('Inline $e^{i\\pi}+1=0$.');
// '<p>Inline <span class="math inline">e^{i\\pi}+1=0</span>.</p>\n'
m.renderHtml('$$\\int_0^\\infty e^{-x}dx = 1$$');
// '<p>\n<div class="math display">\\int_0^\\infty e^{-x}dx = 1</div>\n</p>\n'   (inline `$$…$$` stays inside its paragraph)
```

### Case 2 — fenced math block

```js
m.renderHtml('```math\n\\sum_{i=1}^n i\n```');
// '<div class="math display">\\sum_{i=1}^n i\n</div>\n'
```

## Notes

- Pairs client-side with KaTeX or MathJax to render the spans.
- The inline `$…$` regex is non-greedy and excludes newlines — no support for multiline inline LaTeX.
- `$$…$$` accepts multiline content.
- Escape literal `$` with `\$` in the source.
- Install `mdMath` before `mdSubsuper` and `mdHighlight`; installed after them, `$x^{2}y^{3}$` / `$a==b==c$` are split before math claims them.

## See also

- [`mdMermaid`](./mermaid.md) — another render-wrapper extra
- [`mdHighlight`](./highlight.md) — another post-walk extra
- [Extending](../../guide/extending.md)
