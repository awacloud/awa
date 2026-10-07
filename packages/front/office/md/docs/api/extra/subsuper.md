---
module: mdSubsuper
category: md/extra
dependencies: [mdNode, mdAstWalker, mdAstTypes]
returns: object
worker-safe: true
status: complete
---

# mdSubsuper

> Subscript `H~2~O` + superscript `E=mc^2^` (Pandoc / Quarto).

**Module** `mdSubsuper` | **Source** `packages/front/office/md/src/extra/subsuper.js` | **Deps** `mdNode`, `mdAstWalker`, `mdAstTypes` | **Worker-safe** yes

AST post-parse pass — the source text is never rewritten, so code spans, fenced code, autolinks and bare URLs keep their bytes. A single-tilde strikethrough without whitespace (`~x~`) becomes a `subscript` node, and `^x^` in text becomes a `superscript` node; both are lowered to `<sub>` / `<sup>` at render time.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md         = runtime.resolve('md');
const mdSubsuper = runtime.resolve('mdSubsuper');
const m = md.createMd().use(mdSubsuper);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdSubsuper'`, the key `.use()` deduplicates on |
| `install` | `(md) => void` | Patches `md.parse` (runs `expandSubSupInAst`), `md.render` (runs `lowerSubSupToHtml`) and `md.renderHtml` |
| `expandSubSupInAst` | `(root: Node) => void` | Standalone post-parse pass: single-tilde `strikethrough` → `subscript`, `^x^` → `superscript`, in place |
| `lowerSubSupToHtml` | `(root: Node) => void` | Standalone render-time rewrite of each `subscript` / `superscript` node into trusted `<sub>` / `<sup>` inline HTML |

## Examples

### Case 1 — usage under the safe default

```js
const m = md.createMd().use(mdSubsuper);
m.renderHtml('H~2~O and E=mc^2^');
// '<p>H<sub>2</sub>O and E=mc<sup>2</sup></p>\n'
m.renderHtml('`E=mc^2^` and https://ex.org/~a/~b/');
// '<p><code>E=mc^2^</code> and <a href="https://ex.org/~a/~b/">https://ex.org/~a/~b/</a></p>\n'
```

### Case 2 — standalone AST passes

```js
const plain = md.createMd();                 // the extra is not installed
const ast = plain.parse('H~2~O and E=mc^2^');
mdSubsuper.expandSubSupInAst(ast);
mdSubsuper.lowerSubSupToHtml(ast);
plain.render(ast);
// '<p>H<sub>2</sub>O and E=mc<sup>2</sup></p>\n'
```

## Notes

- Single-tilde rule: the parser records the tilde run length on every `strikethrough` node (`delimiterCount`, 1 or 2). Only with this extra installed is a `delimiterCount: 1` strikethrough reinterpreted as a subscript; without it, GFM `~x~` still renders `<del>x</del>`. `~~x~~` always stays a strikethrough.
- Whitespace rule: the body of `~…~` / `^…^` cannot contain whitespace (Pandoc convention). `~a b~` stays `<del>a b</del>`; `^a b^` stays literal.
- Escapes: `\~` and `\^` keep the literal character, and so does the `&#94;` entity — an escaped or encoded `^` is never matched.
- Text inside an autolink (`<https://…>`, a bare URL, an email autolink) is left alone; `^x^` in an ordinary link text becomes a `<sup>` inside the link.
- Trusted nodes: `lowerSubSupToHtml` builds its tags with `mdNode.trustedHtmlInline`, so they survive the renderer's `safe` default, while author raw HTML in the same document (`<sub>x</sub>` included) is still stripped.
- `md.renderMarkdown` on the parsed AST serialises the nodes back: `H~2~O` / `E=mc^2^` round-trip.
- Install `mdSubsuper` after `mdMath` (and after `mdFootnotes`): installed before them, `$x^{2}y^{3}$` is split before math claims it and `[^1]` references are scanned as text.

## See also

- [`mdHighlight`](./highlight.md) — another inline extra, also post-walk
- [AST node slots](../ast/node.md) — `delimiterCount` on `strikethrough`
- [Extending](../../guide/extending.md)
