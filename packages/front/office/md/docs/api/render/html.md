---
module: renderHtmlMod
category: md/render
dependencies: [mdErrors]
returns: object
worker-safe: true
status: complete
---

# render/html

> AST → cmark-compatible HTML — safe mode, softbreak, raw-HTML filter.

**Module** `renderHtmlMod` | **Source** `packages/front/office/md/src/render/html.js` | **Deps** `mdErrors` | **Worker-safe** yes

Walks the AST emitting an HTML string conforming to `cmark` conventions (CommonMark Appendix: HTML rendering). Escapes `&<>"`, percent-encodes URLs per CommonMark, and hardens by default: `safe` (on unless `safe: false`) strips the raw HTML that came from the Markdown source and neutralizes `javascript:` / `vbscript:` / `file:` / `data:` URLs. Nodes an extension builds with `mdNode.trustedHtmlInline(literal)` / `mdNode.trustedHtmlBlock(literal)` are kept under `safe` (the built-in extras use the same factories; see [`ast/node`](../ast/node.md)); any other `html_inline` / `html_block` node is treated as source HTML.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const r = runtime.resolve('renderHtmlMod');
// { renderHtml }
```

Or via the `md` facade: `md.render(ast)` takes an AST, `md.renderHtml(text)` parses a string first:

```js
const md = runtime.resolve('md');
const ast = md.parse('# Hi');
md.render(ast);          // AST in, HTML out
md.renderHtml('# Hi');   // text in, HTML out
```

Or calling the factory by hand (pass the resolved errors module first):

```js
import { renderHtmlMod, mdErrors } from '@awacloud/md';
const { renderHtml } = renderHtmlMod.factory(mdErrors.factory());
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `renderHtml` | `(ast: Node, opts?) => string` | HTML string |
| `escapeHtml` | `(s: string) => string` | Local HTML escaper (`& < > "`) |
| `encodeUrl` | `(s: string) => string` | Local CommonMark URL percent-encoder |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `safe` | `true` | Strips source `html_block` / `html_inline` (built-in extras' nodes are kept), neutralizes `javascript:` / `vbscript:` / `file:` / `data:` URLs. `false` restores the spec-exact CommonMark passthrough |
| `allowDataImage` | `false` | While `safe` is on, re-allows `data:image/(png\|jpeg\|gif\|webp\|svg+xml\|bmp\|ico\|avif\|apng)` |
| `softbreak` | `'\n'` | Soft-line-break replacement (`' '`, `'<br />\n'`) |
| `disallowedRawHtml` | `true` | Filters the GFM disallowed raw HTML tags (`<script>`, `<title>`, …); `false` keeps them |

`sanitize` / `sanitizeOpts` are not options of this module: the [`md`](../md.md) facade applies them after calling `renderHtml`, through [`@awacloud/fw/dom/rendering/sanitize.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md).

## Examples

### Basic

```js
const md = runtime.resolve('md');
md.renderHtml('# Hi\n\n*world*');
// '<h1>Hi</h1>\n<p><em>world</em></p>\n'
```

### Safe by default, `safe: false` for the spec passthrough

```js
md.renderHtml('<script>alert(1)</script>\n\n**bold**');
// '<p><strong>bold</strong></p>\n'
md.renderHtml('<script>alert(1)</script>\n\n**bold**', { safe: false });
// '&lt;script>alert(1)&lt;/script>\n<p><strong>bold</strong></p>\n'   (GFM tagfilter only)
```

A raw HTML block that is not followed by a blank line swallows the lines after it, so keep the blank line (CommonMark HTML block rules).

### Softbreak as `<br />`

```js
md.renderHtml('a\nb', { softbreak: '<br />\n' });
// '<p>a<br />\nb</p>\n'
```

## Notes

- Rendering follows the reference `cmark` output byte-for-byte (block-level newlines, double newline before `</li>` in loose lists, etc.).
- URLs are percent-encoded via the helpers in `src/common.js` (which delegate to `@awacloud/fw/io/codec/url.js#encodeSafe`) — preserves valid `%HH`, encodes unsafe ASCII (`< > \ ` " etc.) and non-ASCII UTF-8.
- `safe` (the default) is a baseline protection (`data:` URLs blocked, `allowDataImage: true` to re-allow `data:image/*`). For complete XSS hardening, use the facade's `sanitize: true`, which pipes the output through `@awacloud/fw/dom/rendering/sanitize.js` (stricter defaults: `<input>` is out of the allowlist and `data:` URLs are always removed).
- Throws `RenderError` if the walker encounters an unknown type — guard against extras producing unhandled types by wrapping the renderer or lowering to `html_inline`.

## See also

- [`render/markdown`](./markdown.md) — roundtrip
- [`render/xml`](./xml.md) — stable XML AST
- [`@awacloud/fw/dom/rendering/sanitize`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md) — post-render XSS pipe
- [Read+write](../../guide/read-write.md)
