# Documentation `@awacloud/md`

Markdown parser / serializer (CommonMark + GFM). This is the documentation index of `@awacloud/md`: guides first, then the API reference by module. Start with the [package README](../README.md) for installation and a first example; every page assumes `@awacloud/fw` and `@awacloud/md` as ES modules and the `ModuleRuntime` registration shown in [Getting started](./guide/getting-started.md).

## Guides

| Guide | Topic |
|-------|-------|
| [Getting started](./guide/getting-started.md) | Install, factory pattern, `ModuleRuntime`, first parse / render |
| [Read+write](./guide/read-write.md) | `parse` + `renderHtml` / `renderMarkdown` (CommonMark + GFM roundtrip) / `renderXml`, AST mutation, sanitize |
| [Extending](./guide/extending.md) | Write an extra `{ name, install(md) }` — full `==mark==` example |
| [Coverage](./guide/coverage.md) | What the CommonMark and GFM suites cover (and their limits), the 10 opt-in extras, adding a test case |
| [document/html-document](./guide/html-document.md) | md(s) → one self-contained HTML page: single/multi, theme, custom extras, the `resolve` hook, in a browser via import map, what the notice covers |

## API reference

Top-level: see the [API index](./api/README.md). By domain:

- [`md`](./api/md.md) — top-level factory + `.use()`
- [`errors`](./api/errors.md) — `MdError` hierarchy
- [`ast/`](./api/ast/) — `Node`, `Walker`, manipulation, types
- [`block/parser`](./api/block/parser.md) — CommonMark block phase
- [`inline/parser`](./api/inline/parser.md) — CommonMark + GFM inline phase
- [`refs/link-refs`](./api/refs/link-refs.md) — link reference map
- [`render/`](./api/render/) — `html`, `markdown` (CommonMark + GFM roundtrip), `xml`
- Sanitize — consumed from [`@awacloud/fw/dom/rendering/sanitize.js`](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/api/dom/rendering/sanitize.md)
- [`md-walker`](./api/md-walker.md) — visitor walker enter/exit
- [`common`](./api/common.md) — char codes + helpers (backed by `@awacloud/fw`)
- [`bootstrap`](./api/bootstrap.md) — `bootstrapMd(opts)`, the runtime-bootstrap primitive
- **[`document/`](./api/document/theme.md)** — `mdHtmlTheme` + `mdHtmlDocument`: md(s) → one self-contained HTML page
- **[`extra/`](./api/extra/README.md)** — 10 opt-in modules
- **[`bundles/`](./api/bundles/README.md)** — `md-full` (the core surface is the `md` module itself, see below)

## Core module index

| Module | Source | Role |
|--------|--------|------|
| `mdErrors` | [`src/errors.js`](../src/errors.js) | `MdError` / `ParseError` / `RenderError` / `ContractError`. |
| `mdCommon` | [`src/common.js`](../src/common.js) | Char codes + HTML / URL helpers (see [`common`](./api/common.md)). |
| `mdShared` | [`src/_shared/index.js`](../src/_shared/index.js) | Stateless helpers the extras share (`escapeHtml`, `unescapeHtml`, `escapeForRegex`, `createLocalWalker`). |
| `mdAstTypes` | [`src/ast/types.js`](../src/ast/types.js) | AST type constants + container helpers. |
| `mdNode` | [`src/ast/node.js`](../src/ast/node.js) | `Node` + `Walker` classes (CommonMark event semantics). |
| `mdAstWalker` | [`src/ast/walker.js`](../src/ast/walker.js) | `walk(root)` for-of generator over `Node`'s `Walker` (documented alongside [`ast/node`](./api/ast/node.md)). |
| `mdAstManipulation` | [`src/ast/manipulation.js`](../src/ast/manipulation.js) | Md-flavored `cloneNode` + `wrapNode` + `replaceNode` / `flattenNode` / `findFirst` / `findAll`. Throws `ContractError` (`md/...` codes). Local implementation — does **not** delegate to `@awacloud/fw/io/structures/tree-walker.js` (preserves CommonMark semantics); for generic framework-agnostic traversal, see `@awacloud/fw/io/structures/tree-walker.js`. |
| `refsLinkRefs` | [`src/refs/linkRefs.js`](../src/refs/linkRefs.js) | Link reference definitions normalization + map. |
| `blockParser` | [`src/block/parser.js`](../src/block/parser.js) | Block-phase parser (CommonMark §4), composed from the `mdBlock*` sub-module descriptors. |
| `inlineParser` | [`src/inline/parser.js`](../src/inline/parser.js) | Inline-phase parser + GFM, composed from the `mdInline*` sub-module descriptors; `inlineParserBuilder` binds its options per `createMd`. |
| `renderHtmlMod` | [`src/render/html.js`](../src/render/html.js) | `cmark`-compliant HTML renderer. |
| `renderXmlMod` | [`src/render/xml.js`](../src/render/xml.js) | XML AST renderer compatible with `cmark --to xml`. |
| `renderMarkdownMod` | [`src/render/markdown.js`](../src/render/markdown.js) | Markdown renderer, roundtrip-safe for CommonMark + GFM. |
| `mdWalker` | [`src/md-walker.js`](../src/md-walker.js) | Visitor walker enter/exit + `.use()`. |
| `mdMod` | [`src/md.js`](../src/md.js) | Top-level `md` factory descriptor (name `'md'`). |
| `mdHtmlTheme` | [`src/document/theme.js`](../src/document/theme.js) | Embedded stylesheet of the single-HTML document — light/dark/auto, layout, print. |
| `mdHtmlDocument` | [`src/document/html-document.js`](../src/document/html-document.js) | Md(s) → ONE self-contained, sanitised HTML document (`renderFragment`, `build`). |

## Extras (opt-in)

| Module | Source | Role |
|--------|--------|------|
| `mdFrontmatter` | [`src/extra/frontmatter.js`](../src/extra/frontmatter.js) | YAML / TOML / JSON frontmatter. |
| `mdEmoji` | [`src/extra/emoji.js`](../src/extra/emoji.js) | `:smile:` → 😄 (extensible table). |
| `mdMath` | [`src/extra/math.js`](../src/extra/math.js) | `$inline$`, `$$display$$`, ` ```math `. |
| `mdFootnotes` | [`src/extra/footnotes.js`](../src/extra/footnotes.js) | `[^1]` + `[^1]: body`. |
| `mdWikilinks` | [`src/extra/wikilinks.js`](../src/extra/wikilinks.js) | `[[Page]]`, `[[Page\|alias]]`. |
| `mdAdmonitions` | [`src/extra/admonitions.js`](../src/extra/admonitions.js) | GitHub `[!NOTE]` + MkDocs `!!! note`. |
| `mdHighlight` | [`src/extra/highlight.js`](../src/extra/highlight.js) | `==marked==` → `<mark>`. |
| `mdSubsuper` | [`src/extra/subsuper.js`](../src/extra/subsuper.js) | `H~2~O`, `E=mc^2^`. |
| `mdToc` | [`src/extra/toc.js`](../src/extra/toc.js) | TOC + `[[TOC]]` placeholder. |
| `mdMermaid` | [`src/extra/mermaid.js`](../src/extra/mermaid.js) | ` ```mermaid ` → `<div class="mermaid">`. |

## Bundles

`@awacloud/md` ships **one** pre-wired bundle, `md-full` (core + all 10 extras). The core surface is simply the `md` module (`mdMod`) itself, resolved directly.

| Bundle | Source | Includes |
|--------|--------|----------|
| — (core) | [`src/md.js`](../src/md.js) | Resolve `'md'` directly — this *is* the core surface (default). |
| [`md-full`](./api/bundles/md-full.md) | [`src/bundles/md-full.js`](../src/bundles/md-full.js) | Core + 10 pre-wired extras. |

Each bundle exposes a pure factory descriptor (`{ name, dependencies, factory }`) — there is no ready-made singleton at the package root. Consumption via a runtime:

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras, bundle } from '@awacloud/md';

runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.registerAll(bundle);

const md     = runtime.resolve('md');            // core
const mdFull = runtime.resolve('mdFullBundle');   // core + all extras
md.parse('# Hello');
```

### Pre-built bundles (`dist/`)

`tools/generate-bundles.mjs` (a driver over `@awacloud/tool-prebuild-generator`) emits, for each of the 2 assembly roots (`md`, `md-full`), a two-surface build under `dist/`:

| File | Dependencies | Use case |
|------|--------------|----------|
| `dist/standalone/md.js` (`mdBundled`) | `[]` | Core, everything inlined, zero external resolution. Simplest to `factory.toString()` into a Worker. |
| `dist/build/md.js` (`mdPackage`) | `['secPolicy','sanitize','htmlEntities','url']` | Core, delegates the 4 `@awacloud/fw` helpers to the runtime. Lighter bundle on the `@awacloud/md` side. |
| `dist/standalone/md-full.js` (`mdFullBundled`) | `[]` | `md-full` (core + 10 extras), everything inlined. |
| `dist/build/md-full.js` (`mdFullPackage`) | `['secPolicy','sanitize','htmlEntities','url']` | `md-full` delegated to the `@awacloud/fw` helpers. |

`dist/build/index.js` is an fw-mode barrel re-exporting all of `@awacloud/md` (the 4 arrays + every named descriptor), for bulk registration on an `@awacloud/fw` runtime.

Regeneration: `bun run gen:bundles` (idempotent — byte-identical, no build stamp; every bundle opens with the `/*! … */` licence banner at byte 0).

## Project documents

- [README](../README.md) — package overview
- [CHANGELOG](../CHANGELOG.md) — what changed, per release

## See also

- [`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/md@1.0.0/packages/front/fw) — shared runtime + helpers (sole dependency)
- [Doc format spec (fw)](https://github.com/awacloud/awa/blob/@awacloud/md@1.0.0/packages/front/fw/docs/guide/doc-format.md) — convention used here
- [CommonMark 0.31](https://spec.commonmark.org/0.31.2/)
- [GitHub Flavored Markdown](https://github.github.com/gfm/)
