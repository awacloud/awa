# API `@awacloud/md`

Per-module reference, organized by sub-domain. Mirrors `src/`.

**Prerequisites**: every page resolves its module through an `@awacloud/fw` `ModuleRuntime` after registering the package manifest (`fw_require`, then `modules`, then `extras` / `bundle` where a page needs them), as shown in [Getting started](../guide/getting-started.md) and in each page's Resolve section.

## Top-level

| Module | Source | Description |
|--------|--------|--------------|
| [`md`](./md.md) | `src/md.js` | **Top-level facade** — `parse`, `render`, `renderHtml/Markdown`, `use`. |
| [`errors`](./errors.md) | `src/errors.js` | `MdError` + `ParseError` + `RenderError` + `ContractError` hierarchy. |
| [`common`](./common.md) | `src/common.js` | Char codes + helpers backed by `@awacloud/fw/io/text/html-entities.js` and `@awacloud/fw/io/codec/url.js` (`encodeSafe`). |
| [`md-walker`](./md-walker.md) | `src/md-walker.js` | Visitor walker enter/exit + `.use()` |
| [`bootstrap`](./bootstrap.md) | `src/bootstrap.js` | `bootstrapMd(opts)` — registers all four manifest arrays on an `@awacloud/fw` `ModuleRuntime` and returns lazy accessors, in one call. |

## Document

Md(s) → ONE self-contained, sanitised HTML page.

| Module | Source | Description |
|--------|--------|--------------|
| [`document/theme`](./document/theme.md) | `src/document/theme.js` | `mdHtmlTheme` — embedded stylesheet (light/dark/auto, layout, print). |
| [`document/html-document`](./document/html-document.md) | `src/document/html-document.js` | `mdHtmlDocument` — `renderFragment` (one document → a sanitised fragment with heading ids) and `build` (N documents → one complete HTML page). |

## AST

| Module | Source | Description |
|--------|--------|--------------|
| [`ast/node`](./ast/node.md) | `src/ast/node.js` | `Node` + `Walker` classes (doubly-linked tree, CommonMark event semantics) — also documents the `mdAstWalker` `walk()` for-of shim. |
| [`ast/manipulation`](./ast/manipulation.md) | `src/ast/manipulation.js` | Md-flavored `cloneNode` + `wrapNode` + `replaceNode` / `flattenNode` / `findFirst` / `findAll`. Local implementation (no delegation to `@awacloud/fw/io/structures/tree-walker.js`) to preserve CommonMark semantics and throw `ContractError`. |
| [`ast/types`](./ast/types.md) | `src/ast/types.js` | `T_*` constants + `isContainerType`. |

## Parsing

| Module | Source | Description |
|--------|--------|--------------|
| [`block/parser`](./block/parser.md) | `src/block/parser.js` | CommonMark block phase (lazy continuation, list parsing, link refs). Composed from the `mdBlock*` sub-modules registered as its own factory dependencies. |
| [`inline/parser`](./inline/parser.md) | `src/inline/parser.js` | CommonMark + GFM inline phase (delimiter stack, autolinks, strikethrough). Composed from the `mdInline*` sub-modules registered as its own factory dependencies. |
| [`refs/link-refs`](./refs/link-refs.md) | `src/refs/linkRefs.js` | `[label]: /url "title"` map (Unicode normalization). |

## Rendering

| Module | Source | Description |
|--------|--------|--------------|
| [`render/html`](./render/html.md) | `src/render/html.js` | AST → HTML (cmark-compatible, safe mode, softbreak). |
| [`render/markdown`](./render/markdown.md) | `src/render/markdown.js` | AST → Markdown (roundtrip-safe). |
| [`render/xml`](./render/xml.md) | `src/render/xml.js` | AST → cmark-compatible XML. |

## Sanitize

The HTML sanitizer is now consumed from
[`@awacloud/fw/dom/rendering/sanitize.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md)
(`sanitizeHtml`, `isSafeUrl`, `defaultAllowlist`, resolved as the `sanitize` module). Enable it via
`md.render(ast, { sanitize: true, sanitizeOpts })`.

## Extras and bundles

- [`extra/`](./extra/README.md) — 10 opt-in modules.
- [`bundles/`](./bundles/README.md) — `md-full` (core + extras). There is no separate bundle wrapper for the core — resolve `'md'` directly.

## Typical usage pattern

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
const md = runtime.resolve('md');

md.renderHtml('# Hello\n\n*world*');
// '<h1>Hello</h1>\n<p><em>world</em></p>\n'
```

To plug in extras, see the [`.use(...)` hook](../guide/extending.md).

## See also

- [Getting started](../guide/getting-started.md)
- [Read+write](../guide/read-write.md)
- [Extending](../guide/extending.md)
- [Coverage](../guide/coverage.md)
- [document/html-document guide](../guide/html-document.md)
