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

The extension declares `inlineSyntax: ['math']`: on an instance it is installed on (`md.use(mdMath)`), the inline parser claims every `$…$` / `$$…$$` span before any other inline construct — like a code span — and emits `math_inline` / `math_block` carrying the LaTeX source verbatim in `literal`, so `$H~2~O$` is no strikethrough and `$a*b*c$` no emphasis, whatever the install order of the other extras. A code span opened before the `$` still wins. Fenced code blocks with the `math` info string are converted to `math_block` by a post-parse pass. At render time, wraps in `<span class="math inline">` / `<div class="math display">`.

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
| `inlineSyntax` | `['math']` | Read by `md.parse`: the inline parser claims the math spans |
| `install` | `(md) => void` | Patches `md.parse`, `md.render` and `md.renderHtml` |
| `splitMath` | `(lit: string) => Array<{kind, value}> \| null` | Standalone splitter; `null` when the text holds no `$` |
| `expandMathInAst` | `(root: Node, opts?) => Node` | Standalone AST pass (fenced math blocks, and `$` spans split out of text nodes — for an AST parsed without the claim); `opts.textSpans: false` skips the text split. Returns `root` |
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
- A `$…$` span closes at the next `$` not escaped by a backslash, with at least one character between; a `$$…$$` span at the next `$$`. Neither crosses a line break — no multiline LaTeX outside a fenced ` ```math ` block.
- Escape a literal `$` with `\$` in the source; inside a span the LaTeX is kept verbatim (`$a\$b$` → `a\$b`).
- The install order does not matter: `$x^{2}y^{3}$` / `$a==b==c$` stay math with `mdSubsuper` / `mdHighlight` installed before or after.

## See also

- [`mdMermaid`](./mermaid.md) — another render-wrapper extra
- [`mdHighlight`](./highlight.md) — another post-walk extra
- [Extending](../../guide/extending.md)
