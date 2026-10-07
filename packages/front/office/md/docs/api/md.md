---
module: md
category: md
dependencies: [mdErrors, blockParser, inlineParser, inlineParserBuilder, renderHtmlMod, renderMarkdownMod, sanitize]
returns: object
worker-safe: true
status: complete
---

# md

> Top-level facade — `parse`, `render`, `renderHtml/Markdown`, `use`.

**Module** `md` (`mdMod`) | **Source** `packages/front/office/md/src/md.js` | **Deps** `mdErrors`, `blockParser`, `inlineParser`, `inlineParserBuilder`, `renderHtmlMod`, `renderMarkdownMod`, `sanitize` | **Worker-safe** yes

There is no pre-instantiated top-level singleton — resolve `'md'` through an `@awacloud/fw` `ModuleRuntime` (see [Resolve](#resolve)). The resolved instance exposes `.createMd(opts)` to produce an isolated instance for workers or divergent configurations; each instance maintains its own list of extensions installed via `.use()`.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
const md = runtime.resolve('md');
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(text: string) => Node` | AST root (document) with `data.refmap` |
| `render` | `(ast: Node, opts?) => string` | HTML of an AST (the only HTML method that takes an AST) |
| `renderHtml` | `(text: string, opts?) => string` | HTML: parses the text, then calls `render`. Passing an AST throws `md/parse-not-string` |
| `renderMarkdown` | `(textOrAst, opts?) => string` | Markdown; a string is parsed with `md.parse` (extension passes included). Round-trip covers CommonMark + GFM plus subscript, superscript and highlight — see [render/markdown](./render/markdown.md) Notes |
| `use` | `(ext: {name, install(md)}) => api` | Chainable, idempotent |
| `extensions` | `Array` | List of installed extensions |
| `createMd` | `(opts?) => MdInstance` | Produces a fresh isolated instance |
| `ContractError` | `class` | Attached error class for `instanceof` checks |

### `md.createMd(opts)` / `runtime.resolve('md').createMd(opts)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourcepos` | `boolean` | `false` | Inline nodes carry `sourcepos` too (block nodes always do) |
| `smart` | `boolean` | `false` | Typographic (curly) quotes for `"` and `'` |
| `extendedAutolinks` | `boolean` | `true` | GFM extended autolink (`www.example.com`) |
| `sanitize` | `boolean` | `false` | Pipes the rendered HTML through `@awacloud/fw/dom/rendering/sanitize.js` |
| `sanitizeOpts` | `object` | `{}` | Options passed to the fw `sanitizeHtml`: `allowedTags`, `allowedAttributes`, `urlSchemes`, `dropDangerousContent` |
| `maxDepth` | `number` | `1000` | Maximum node nesting depth before `md/limit-exceeded` (`Infinity` opts out) |
| `maxNodes` | `number` | `100000` | Maximum AST node count before `md/limit-exceeded` (`Infinity` opts out) |
| `maxUrlLength` | `number` | `8192` | Maximum URL length allowed in a link / image (`Infinity` opts out) |

Every `render` / `renderHtml` option below (`safe`, `softbreak`, `disallowedRawHtml`, `allowDataImage`, `sanitize`, `sanitizeOpts`) can also be given here, as the instance default; a per-call option wins. The legacy `allowlist` option was removed and only logs a `console.warn`.

### `render` / `renderHtml` options

| Option | Default | Description |
|--------|---------|-------------|
| `safe` | `true` | Strips raw HTML from the Markdown source, neutralizes `javascript:` / `vbscript:` / `file:` / `data:` URLs (`data:image/*` is opt-in via `allowDataImage`). The HTML the built-in extras generate is kept. An extension can emit kept HTML through `mdNode.trustedHtmlInline` / `trustedHtmlBlock`. `safe: false` restores the spec-exact CommonMark raw passthrough |
| `softbreak` | `'\n'` | Soft-break replacement |
| `disallowedRawHtml` | `true` | Filters disallowed GFM raw HTML tags (`<script>`, `<title>`, …) |
| `sanitize` | `false` | Pipes the rendered HTML through the fw `sanitizeHtml` (applied by this facade, not by the renderer module) |
| `sanitizeOpts` | `{}` | Options of the fw `sanitizeHtml` (see above). It has no `allowDataImage` key: the fw sanitizer always removes `data:` URLs from `href` / `src` |
| `allowDataImage` | `false` | While `safe` is on (the default), allows `data:image/(png\|jpeg\|gif\|webp\|svg+xml\|bmp\|ico\|avif\|apng)`. It does not apply to `sanitize: true`, which always removes them |

### `renderMarkdown` options

`renderMarkdown(textOrAst, opts?)` accepts an `opts` object and reads no option from it: the output style is fixed (ATX headings, `*` emphasis, `**` strong, backtick fences, and each list keeps the bullet character it was parsed with, `-` by default). See [`render/markdown`](./render/markdown.md).

## Examples

### Parse + render

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const md = runtime.resolve('md');

const ast = md.parse('# Hello\n\n*world*');
md.render(ast);                        // an AST goes through `render`
// '<h1>Hello</h1>\n<p><em>world</em></p>\n'
md.renderHtml('# Hello\n\n*world*');   // text goes through `renderHtml`
// '<h1>Hello</h1>\n<p><em>world</em></p>\n'
```

### Isolated instance with extras

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md = runtime.resolve('md');
const mdFrontmatter = runtime.resolve('mdFrontmatter');
const m = md.createMd().use(mdFrontmatter);
```

## Notes

- `md.parse` throws `ContractError` if the input is not a string.
- `.use(ext)` is idempotent — installing the same `name` twice is a no-op.
- The core `renderHtml(text)` shortcut closes over the instance's original `parse`; an extra that patches `md.parse` must also re-wire `md.renderHtml` (see [extending](../guide/extending.md)). Every extra of the package does, and its re-wired `renderHtml` accepts text or an AST, so on an instance with an extra installed `renderHtml(ast)` works too.
- The returned AST is `structuredClone`-serializable and JSON-friendly (unprefixed public slots).
- `@awacloud/md`'s package root (`src/main.js`) is strict factory-only — there is no top-level `md`/`createMd` export to import directly; always resolve through a runtime as shown above.

## See also

- [`md.js` source](../../src/md.js)
- [`errors`](./errors.md) — thrown error types
- [`ast/node`](./ast/node.md) — type of the `parse` return value
- [Getting started](../guide/getting-started.md)
- [Read+write](../guide/read-write.md)
